import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { prisma as db } from "@commerce/database";
import {
  CartService,
  cartInclude,
  couponDiscount,
  CartRecord,
} from "./cart.service";
import { calculateTotals, assertTransition, refundAmount } from "./domain";
import { CommerceRequest, newToken } from "./security";
import { Tx, serial, idempotent, orderInclude, emit, audit } from "./helpers";
export type CheckoutInput = {
  email: string;
  address: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    phone?: string;
  };
  shippingMethod: "standard" | "express";
  paymentMethod: "mock_success" | "mock_fail";
};
export interface PaymentProvider {
  charge(
    amountCents: number,
    reference: string,
    method: string,
  ): Promise<{
    status: "succeeded" | "failed";
    reference: string;
    errorCode?: string;
  }>;
}
export class MockPaymentProvider implements PaymentProvider {
  async charge(_amount: number, reference: string, method: string) {
    return method === "mock_fail"
      ? { status: "failed" as const, reference, errorCode: "mock_declined" }
      : { status: "succeeded" as const, reference };
  }
}
@Injectable()
export class CheckoutService {
  private provider: PaymentProvider = new MockPaymentProvider();
  constructor(private carts: CartService) {}
  async checkout(req: CommerceRequest, input: CheckoutInput, key: string) {
    const cart = await this.carts.get(req);
    return serial((tx) =>
      idempotent(tx, `checkout:${cart.id}`, key, input, async () => {
        const fresh = await tx.cart.findUnique({
          where: { id: cart.id },
          include: cartInclude,
        });
        if (!fresh) throw new BadRequestException("Cart expired");
        const items = fresh.items.filter((i) => !i.savedForLater);
        if (!items.length) throw new BadRequestException("Cart is empty");
        const discount = await couponDiscount(tx, fresh, input.email);
        const totals = calculateTotals(
          discount.subtotal,
          discount.discount,
          input.shippingMethod,
          discount.freeShipping,
        );
        const gift = fresh.giftCardCode
          ? await tx.giftCard.findUnique({
              where: { code: fresh.giftCardCode },
            })
          : null;
        if (
          fresh.giftCardCode &&
          (!gift?.active || (gift.expiresAt && gift.expiresAt < new Date()))
        )
          throw new BadRequestException("Gift card expired");
        const giftApplied = Math.min(gift?.balanceCents ?? 0, totals.total);
        const order = await tx.order.create({
          data: {
            number: `FW-${Date.now().toString(36).toUpperCase()}-${newToken().slice(0, 5).toUpperCase()}`,
            email: input.email,
            userId: req.actor?.id,
            cartId: fresh.id,
            giftCardCode: fresh.giftCardCode,
            giftCardAppliedCents: giftApplied,
            trackingToken: newToken(),
            subtotalCents: totals.subtotal,
            discountCents: totals.discount,
            shippingCents: totals.shipping,
            taxCents: totals.tax,
            totalCents: totals.total,
            couponCode: fresh.couponCode,
            shippingMethod: input.shippingMethod,
            items: {
              create: items.map((i) => ({
                productId: i.variant.productId,
                variantId: i.variantId,
                name: i.variant.product.name,
                sku: i.variant.sku,
                quantity: i.quantity,
                unitPriceCents: i.variant.priceCents,
                totalCents: i.quantity * i.variant.priceCents,
                imageUrl: i.variant.product.imageUrl,
                options: i.variant.options ?? {},
              })),
            },
            addresses: { create: { kind: "shipping", ...input.address } },
            history: {
              create: {
                status: "pending_payment",
                note: "Checkout submitted",
                actorId: req.actor?.id,
              },
            },
            payments: {
              create: {
                amountCents: totals.total - giftApplied,
                giftCardCents: giftApplied,
                provider: "mock",
              },
            },
          },
          include: orderInclude,
        });
        await this.reserve(
          tx,
          order.id,
          items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        );
        await this.finishPayment(tx, order.id, input.paymentMethod, req);
        return (await tx.order.findUnique({
          where: { id: order.id },
          include: orderInclude,
        }))!;
      }),
    );
  }
  async reserve(
    tx: Tx,
    orderId: string,
    items: { variantId: string; quantity: number }[],
  ) {
    for (const item of [...items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    )) {
      let remaining = item.quantity;
      // Acquire every candidate row in a stable order. PostgreSQL locks prevent overselling across API processes.
      const rows = await tx.$queryRaw<
        { id: string; onHand: number; reserved: number; safetyStock: number }[]
      >`SELECT id,"onHand",reserved,"safetyStock" FROM "InventoryItem" WHERE "variantId"=${item.variantId} ORDER BY id FOR UPDATE`;
      for (const row of rows) {
        const take = Math.min(
          remaining,
          Math.max(0, row.onHand - row.reserved - row.safetyStock),
        );
        if (!take) continue;
        await tx.inventoryItem.update({
          where: { id: row.id },
          data: { reserved: { increment: take }, version: { increment: 1 } },
        });
        await tx.inventoryReservation.create({
          data: {
            inventoryItemId: row.id,
            orderId,
            quantity: take,
            expiresAt: new Date(Date.now() + 15 * 60000),
          },
        });
        remaining -= take;
        if (!remaining) break;
      }
      if (remaining)
        throw new ConflictException(
          "Stock changed while checking out. Please update your cart.",
        );
    }
  }
  async release(tx: Tx, orderId: string) {
    const reservations = await tx.inventoryReservation.findMany({
      where: { orderId, status: "active" },
    });
    for (const r of reservations) {
      const changed = await tx.inventoryReservation.updateMany({
        where: { id: r.id, status: "active" },
        data: { status: "released" },
      });
      if (changed.count)
        await tx.inventoryItem.update({
          where: { id: r.inventoryItemId },
          data: {
            reserved: { decrement: r.quantity },
            version: { increment: 1 },
          },
        });
    }
  }
  private async commit(tx: Tx, orderId: string) {
    const reservations = await tx.inventoryReservation.findMany({
      where: { orderId, status: "active" },
    });
    if (!reservations.length)
      throw new ConflictException(
        "Inventory reservation expired; retry checkout",
      );
    for (const r of reservations) {
      if (r.expiresAt < new Date())
        throw new ConflictException("Inventory reservation expired");
      await tx.inventoryReservation.update({
        where: { id: r.id },
        data: { status: "committed" },
      });
      await tx.inventoryItem.update({
        where: { id: r.inventoryItemId },
        data: {
          onHand: { decrement: r.quantity },
          reserved: { decrement: r.quantity },
          version: { increment: 1 },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: r.inventoryItemId,
          quantity: -r.quantity,
          kind: "sale",
          reason: "Captured order payment",
          reference: orderId,
        },
      });
    }
  }
  async finishPayment(
    tx: Tx,
    orderId: string,
    method: string,
    req?: CommerceRequest,
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { payments: true, items: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.paymentStatus === "succeeded") return;
    const payment = order.payments[0];
    if (!payment)
      throw new BadRequestException("No payment associated with order");
    assertTransition(
      order.status,
      method === "mock_fail" ? "payment_failed" : "paid",
    );
    const result = await this.provider.charge(
      payment.amountCents,
      `mock_${newToken().slice(0, 20)}`,
      method,
    );
    await tx.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        status: result.status,
        providerReference: result.reference,
        errorCode: result.errorCode,
      },
    });
    if (result.status === "failed") {
      await this.release(tx, orderId);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "failed", providerReference: result.reference },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "payment_failed",
          paymentStatus: "failed",
          history: {
            create: { status: "payment_failed", note: "Mock payment declined" },
          },
        },
      });
      return;
    }
    const originalCart = order.cartId
      ? await tx.cart.findUnique({
          where: { id: order.cartId },
          include: cartInclude,
        })
      : null;
    const variants = await tx.productVariant.findMany({
      where: { id: { in: order.items.map((i) => i.variantId!) } },
      include: { product: true, inventory: true },
    });
    if (variants.length !== order.items.length)
      throw new BadRequestException(
        "Purchased variants are no longer available",
      );
    const snapshot: CartRecord = {
      ...(originalCart ?? {
        id: order.cartId ?? order.id,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        token: order.id,
        userId: order.userId,
        expiresAt: null,
        couponCode: order.couponCode,
        giftCardCode: order.giftCardCode,
      }),
      couponCode: order.couponCode,
      giftCardCode: order.giftCardCode,
      items: order.items.map((i) => {
        const v = variants.find((v) => v.id === i.variantId)!;
        return {
          id: i.id,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          cartId: order.cartId ?? order.id,
          variantId: v.id,
          quantity: i.quantity,
          savedForLater: false,
          variant: { ...v, priceCents: i.unitPriceCents },
        };
      }),
    };
    const discount = await couponDiscount(tx, snapshot, order.email);
    if (discount.coupon) {
      const changed = await tx.coupon.updateMany({
        where: {
          id: discount.coupon.id,
          usageCount: discount.coupon.usageCount,
        },
        data: { usageCount: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException("Coupon usage changed, retry checkout");
      await tx.couponRedemption.create({
        data: {
          couponId: discount.coupon.id,
          orderId,
          userId: order.userId,
          email: order.email,
          amountCents: order.discountCents,
        },
      });
    }
    if (order.giftCardCode && order.giftCardAppliedCents) {
      const gift = await tx.giftCard.findUnique({
        where: { code: order.giftCardCode },
      });
      if (
        !gift?.active ||
        (gift.expiresAt && gift.expiresAt < new Date()) ||
        gift.balanceCents < order.giftCardAppliedCents
      )
        throw new BadRequestException(
          "Original gift card no longer has sufficient funds",
        );
      const changed = await tx.giftCard.updateMany({
        where: {
          id: gift.id,
          balanceCents: { gte: order.giftCardAppliedCents },
        },
        data: { balanceCents: { decrement: order.giftCardAppliedCents } },
      });
      if (!changed.count)
        throw new ConflictException("Gift card balance changed");
      await tx.giftCardLedger.create({
        data: {
          giftCardId: gift.id,
          amountCents: -order.giftCardAppliedCents,
          reason: "checkout",
          reference: `order:${orderId}`,
        },
      });
    }
    await this.commit(tx, orderId);
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "succeeded", providerReference: result.reference },
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "paid",
        paymentStatus: "succeeded",
        history: { create: { status: "paid", note: "Payment captured" } },
      },
    });
    if (order.userId) {
      const points = Math.floor(order.totalCents / 100);
      const account = await tx.loyaltyAccount.upsert({
        where: { userId: order.userId },
        create: { userId: order.userId, points },
        update: { points: { increment: points } },
      });
      await tx.loyaltyLedger.create({
        data: {
          accountId: account.id,
          points,
          reason: "purchase",
          reference: `order:${orderId}`,
        },
      });
    }
    if (originalCart)
      await tx.cartItem.deleteMany({
        where: {
          cartId: originalCart.id,
          variantId: { in: order.items.map((i) => i.variantId!) },
          savedForLater: false,
        },
      });
    await emit(tx, "order.placed", { orderId });
    await emit(tx, "email.send", {
      to: order.email,
      subject: `Order ${order.number} confirmed`,
      text: `Your order is confirmed. Track it at ${process.env.APP_ORIGIN ?? "http://localhost:3000"}/track/${order.trackingToken}`,
    });
    await tx.analyticsEvent.create({
      data: {
        type: "order_placed",
        sessionId: originalCart?.token ?? orderId,
        orderId,
        userId: order.userId,
      },
    });
    if (req)
      await audit(tx, req, "payment.capture", "Order", orderId, {
        amountCents: order.totalCents,
      });
  }
  async retry(
    req: CommerceRequest,
    id: string,
    method: string,
    key: string,
    token?: string,
  ) {
    const authorized = await db.order.findUnique({ where: { id } });
    if (
      !authorized ||
      (authorized.userId !== req.actor?.id &&
        authorized.trackingToken !== token)
    )
      throw new NotFoundException("Order not found");
    return serial((tx) =>
      idempotent(tx, `payment:${id}`, key, { method }, async () => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
        const o = await tx.order.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!o || (o.userId !== req.actor?.id && o.trackingToken !== token))
          throw new NotFoundException("Order not found");
        if (!["payment_failed", "pending_payment"].includes(o.status))
          throw new BadRequestException("Order cannot be paid again");
        await this.release(tx, id);
        await this.reserve(
          tx,
          id,
          o.items.map((i) => ({
            variantId: i.variantId!,
            quantity: i.quantity,
          })),
        );
        if (o.status === "payment_failed")
          await tx.order.update({
            where: { id },
            data: { status: "pending_payment" },
          });
        await this.finishPayment(tx, id, method);
        return (await tx.order.findUnique({
          where: { id },
          include: orderInclude,
        }))!;
      }),
    );
  }
  async refund(
    req: CommerceRequest,
    orderId: string,
    amount: number,
    reason: string,
    key: string,
  ) {
    return serial((tx) =>
      idempotent(tx, `refund:${orderId}`, key, { amount, reason }, async () => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { payments: true },
        });
        if (!order) throw new NotFoundException("Order not found");
        const payment = order.payments.find((p) =>
          ["succeeded", "partially_refunded"].includes(p.status),
        );
        if (!payment)
          throw new BadRequestException("No captured refundable payment");
        const refunded = refundAmount(
          payment.amountCents + payment.giftCardCents,
          payment.refundedCents,
          amount,
        );
        const status =
          refunded === payment.amountCents + payment.giftCardCents
            ? "refunded"
            : "partially_refunded";
        const tenderTotal = payment.amountCents + payment.giftCardCents;
        const giftBefore = Math.floor(
          (payment.refundedCents * payment.giftCardCents) / tenderTotal,
        );
        const giftAfter = Math.floor(
          (refunded * payment.giftCardCents) / tenderTotal,
        );
        const giftRefund = giftAfter - giftBefore;
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            amountCents: amount,
            cashAmountCents: amount - giftRefund,
            giftCardAmountCents: giftRefund,
            reason,
            idempotencyKey: `${orderId}:${key}`,
          },
        });
        if (giftRefund && order.giftCardCode) {
          const gift = await tx.giftCard.update({
            where: { code: order.giftCardCode },
            data: { balanceCents: { increment: giftRefund } },
          });
          await tx.giftCardLedger.create({
            data: {
              giftCardId: gift.id,
              amountCents: giftRefund,
              reason: "refund",
              reference: `refund:${orderId}:${key}`,
            },
          });
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { refundedCents: refunded, status },
        });
        await tx.order.update({
          where: { id: orderId },
          data: {
            status,
            paymentStatus: status,
            history: {
              create: { status, note: reason, actorId: req.actor?.id },
            },
          },
        });
        await audit(tx, req, "refund.issue", "Order", orderId, {
          amountCents: amount,
          reason,
        });
        await emit(tx, "email.send", {
          to: order.email,
          subject: `Refund for ${order.number}`,
          text: `A refund of ${(amount / 100).toFixed(2)} ${order.currency} has been processed by the mock provider.`,
        });
        return (await tx.order.findUnique({
          where: { id: orderId },
          include: orderInclude,
        }))!;
      }),
    );
  }
}
