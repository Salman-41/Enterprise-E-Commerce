import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { prisma as db, Prisma } from "@commerce/database";
import type { Response } from "express";
import { newToken, CommerceRequest } from "./security";
import { Tx } from "./helpers";
import { calculateTotals } from "./domain";
export const cartInclude = {
  items: {
    include: { variant: { include: { product: true, inventory: true } } },
  },
};
export type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export async function couponDiscount(tx: Tx, cart: CartRecord, email?: string) {
  const items = cart.items.filter((i) => !i.savedForLater);
  const subtotal = items.reduce(
    (a, i) => a + i.quantity * i.variant.priceCents,
    0,
  );
  const coupon = cart.couponCode
    ? await tx.coupon.findUnique({
        where: { code: cart.couponCode },
        include: { promotion: { include: { rules: true } } },
      })
    : null;
  const now = new Date();
  const p = coupon?.promotion;
  if (
    cart.couponCode &&
    (!p ||
      !p.active ||
      p.startsAt > now ||
      (p.endsAt && p.endsAt < now) ||
      subtotal < p.minimumSpendCents ||
      (p.usageLimit !== null && coupon!.usageCount >= p.usageLimit))
  )
    throw new BadRequestException(
      "Coupon is expired, exhausted or does not meet minimum spend",
    );
  if (coupon && p && email) {
    const uses = await tx.couponRedemption.count({
      where: { couponId: coupon.id, email },
    });
    if (uses >= p.perCustomerLimit)
      throw new BadRequestException("Coupon customer usage limit reached");
  }
  let eligibleItems = items;
  let eligible = subtotal;
  if (p?.rules.length) {
    const includeProducts = p.rules
      .filter((r) => r.kind === "product")
      .map((r) => r.value);
    const excludeProducts = p.rules
      .filter((r) => r.kind === "exclude_product")
      .map((r) => r.value);
    const categoryIds = p.rules
      .filter((r) => r.kind === "category")
      .map((r) => r.value);
    const categoryProducts = categoryIds.length
      ? await tx.productCategory.findMany({
          where: { categoryId: { in: categoryIds } },
          select: { productId: true },
        })
      : [];
    eligibleItems = items.filter(
      (i) =>
        !excludeProducts.includes(i.variant.productId) &&
        (!includeProducts.length ||
          includeProducts.includes(i.variant.productId)) &&
        (!categoryIds.length ||
          categoryProducts.some((c) => c.productId === i.variant.productId)),
    );
    eligible = eligibleItems.reduce(
      (a, i) => a + i.quantity * i.variant.priceCents,
      0,
    );
    if (!eligible)
      throw new BadRequestException("Coupon does not apply to these products");
  }
  let discount = 0;
  let freeShipping = false;
  if (p) {
    if (p.kind === "percent")
      discount = Math.round((eligible * Math.min(100, p.value)) / 100);
    else if (p.kind === "fixed") discount = Math.min(eligible, p.value);
    else if (p.kind === "free_shipping") freeShipping = true;
    else if (p.kind === "bogo")
      discount = eligibleItems.reduce(
        (a, i) => a + Math.floor(i.quantity / 2) * i.variant.priceCents,
        0,
      );
  }
  if (!p) {
    const automatic = await tx.promotion.findFirst({
      where: {
        automatic: true,
        active: true,
        usageLimit: null,
        rules: { none: {} },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        minimumSpendCents: { lte: subtotal },
      },
      orderBy: { value: "desc" },
    });
    if (automatic) {
      if (automatic.kind === "percent")
        discount = Math.round(
          (subtotal * Math.min(100, automatic.value)) / 100,
        );
      else if (automatic.kind === "fixed")
        discount = Math.min(subtotal, automatic.value);
      else if (automatic.kind === "free_shipping") freeShipping = true;
    }
  }
  return { subtotal, discount, freeShipping, coupon };
}
@Injectable()
export class CartService {
  async get(req: CommerceRequest, res?: Response) {
    let cart = req.cookies?.cart
      ? await db.cart.findUnique({
          where: { token: req.cookies.cart },
          include: cartInclude,
        })
      : null;
    if (cart?.userId && cart.userId !== req.actor?.id) cart = null;
    if (!cart && req.actor)
      cart = await db.cart.findFirst({
        where: { userId: req.actor.id },
        include: cartInclude,
      });
    if (!cart) {
      cart = await db.cart.create({
        data: {
          token: newToken(),
          userId: req.actor?.id,
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
        include: cartInclude,
      });
    }
    res?.cookie("cart", cart.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400000,
    });
    return cart;
  }
  async view(cart: CartRecord, shippingMethod = "standard") {
    const discounts = await couponDiscount(db, cart);
    const totals = calculateTotals(
      discounts.subtotal,
      discounts.discount,
      shippingMethod,
      discounts.freeShipping,
    );
    const gift = cart.giftCardCode
      ? await db.giftCard.findUnique({ where: { code: cart.giftCardCode } })
      : null;
    const giftCardAppliedCents =
      gift?.active && (!gift.expiresAt || gift.expiresAt > new Date())
        ? Math.min(gift.balanceCents, totals.total)
        : 0;
    return {
      id: cart.id,
      couponCode: cart.couponCode,
      giftCardCode: cart.giftCardCode,
      items: cart.items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        quantity: i.quantity,
        savedForLater: i.savedForLater,
        name: i.variant.product.name,
        title: i.variant.product.name,
        slug: i.variant.product.slug,
        imageUrl: i.variant.product.imageUrl,
        options: i.variant.options,
        sku: i.variant.sku,
        unitPriceCents: i.variant.priceCents,
        price: i.variant.priceCents / 100,
        totalCents: i.quantity * i.variant.priceCents,
        stock: i.variant.inventory.reduce(
          (a, s) => a + Math.max(0, s.onHand - s.reserved - s.safetyStock),
          0,
        ),
      })),
      ...totals,
      subtotalCents: totals.subtotal,
      discountCents: totals.discount,
      shippingCents: totals.shipping,
      taxCents: totals.tax,
      totalCents: totals.total,
      giftCardAppliedCents,
      amountDueCents: totals.total - giftCardAppliedCents,
    };
  }
  async add(cartId: string, variantId: string, quantity: number) {
    const v = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true, inventory: true },
    });
    if (
      !v ||
      v.product.status !== "published" ||
      (v.product.publishAt && v.product.publishAt > new Date())
    )
      throw new NotFoundException("Variant not available");
    const item = await db.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
    });
    if (
      (item?.quantity ?? 0) + quantity >
      v.inventory.reduce(
        (a, i) => a + Math.max(0, i.onHand - i.reserved - i.safetyStock),
        0,
      )
    )
      throw new BadRequestException(
        "Requested quantity exceeds available stock",
      );
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity },
      update: { quantity: { increment: quantity }, savedForLater: false },
    });
  }
}
