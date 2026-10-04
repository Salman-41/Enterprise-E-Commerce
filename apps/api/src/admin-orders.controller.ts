import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Query,
  Headers,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Prisma, prisma as db } from "@commerce/database";
import { z } from "zod";
import { CommerceRequest, Require } from "./security";
import { audit, emit, parse, pageQuery, orderInclude, serial } from "./helpers";
import { CheckoutService } from "./checkout.service";
import { assertTransition } from "./domain";
@Controller("admin")
@ApiTags("Admin operations")
export class AdminOrdersController {
  constructor(private checkout: CheckoutService) {}
  @Get("orders") @Require("orders.read") async orders(@Query() raw: unknown) {
    const q = parse(
      pageQuery.extend({
        q: z.string().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
      }),
      raw,
    );
    const search = q.q ?? q.search;
    const where: Prisma.OrderWhereInput = {
      status: q.status,
      OR: search
        ? [
            { number: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [items, total] = await Promise.all([
      db.order.findMany({
        where,
        include: orderInclude,
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.order.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  @Get("orders/:id") @Require("orders.read") async order(
    @Param("id") id: string,
  ) {
    const o = await db.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!o) throw new NotFoundException("Order not found");
    return o;
  }
  @Post("orders/:id/refund") @Require("refunds.issue") async refund(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const i = parse(
      z
        .object({
          amount: z.number().int().min(1),
          reason: z.string().min(5).max(1000),
        })
        .strict(),
      raw,
    );
    if (!key) throw new BadRequestException("Idempotency-Key required");
    return this.checkout.refund(r, id, i.amount, i.reason, key);
  }
  @Post("orders/:id/cancel") @Require("orders.manage") async cancel(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
  ) {
    return serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
      const o = await tx.order.findUnique({
        where: { id },
        include: { payments: true },
      });
      if (!o) throw new NotFoundException("Order not found");
      if (!["pending_payment", "payment_failed"].includes(o.status))
        throw new BadRequestException(
          "Captured orders must be refunded before cancellation; shipped orders cannot cancel",
        );
      assertTransition(o.status, "cancelled");
      await this.checkout.release(tx, id);
      const result = await tx.order.update({
        where: { id },
        data: {
          status: "cancelled",
          history: {
            create: {
              status: "cancelled",
              actorId: r.actor!.id,
              note: "Cancelled by operations",
            },
          },
        },
        include: orderInclude,
      });
      await audit(tx, r, "order.cancel", "Order", id);
      return result;
    });
  }
  @Post("orders/:id/fulfill") @Require("orders.manage") async fulfill(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const input = parse(
      z
        .object({
          carrier: z.string().min(2).max(100),
          trackingNumber: z.string().min(2).max(100),
          warehouseId: z.string().optional(),
          items: z
            .array(
              z.object({
                orderItemId: z.string(),
                quantity: z.number().int().min(1),
              }),
            )
            .optional(),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
      const o = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { fulfillmentItems: { include: { fulfillment: true } } },
          },
        },
      });
      if (!o) throw new NotFoundException("Order not found");
      if (
        ![
          "paid",
          "processing",
          "partially_fulfilled",
          "partially_refunded",
        ].includes(o.status)
      )
        throw new BadRequestException("Order is not eligible for fulfillment");
      const remaining = o.items.map((i) => ({
        orderItemId: i.id,
        quantity:
          i.quantity -
          i.fulfillmentItems
            .filter((f) => f.fulfillment.status !== "cancelled")
            .reduce((a, f) => a + f.quantity, 0),
      }));
      const selected = input.items ?? remaining.filter((i) => i.quantity > 0);
      if (!selected.length)
        throw new BadRequestException("No items remaining to fulfill");
      const seen = new Set<string>();
      for (const i of selected) {
        if (seen.has(i.orderItemId))
          throw new BadRequestException("Duplicate fulfillment item");
        seen.add(i.orderItemId);
        const rem = remaining.find((x) => x.orderItemId === i.orderItemId);
        if (!rem || i.quantity > rem.quantity)
          throw new BadRequestException(
            "Fulfillment exceeds remaining quantity",
          );
      }
      const warehouse =
        input.warehouseId ?? (await tx.warehouse.findFirst())?.id;
      if (!warehouse) throw new BadRequestException("No warehouse configured");
      await tx.fulfillment.create({
        data: {
          orderId: id,
          warehouseId: warehouse,
          status: "shipped",
          items: { create: selected },
          shipments: {
            create: {
              carrier: input.carrier,
              trackingNumber: input.trackingNumber,
              status: "shipped",
              events: {
                create: {
                  status: "shipped",
                  message: "Package handed to carrier",
                },
              },
            },
          },
        },
      });
      const fully = remaining.every(
        (i) =>
          i.quantity ===
          (selected.find((s) => s.orderItemId === i.orderItemId)?.quantity ??
            0),
      );
      const status = fully ? "fulfilled" : "partially_fulfilled";
      await tx.order.update({
        where: { id },
        data: {
          status,
          history: {
            create: {
              status,
              note: `Shipment ${input.trackingNumber}`,
              actorId: r.actor!.id,
            },
          },
        },
      });
      await audit(tx, r, "order.fulfill", "Order", id);
      await emit(tx, "order.shipped", { orderId: id });
      return (await tx.order.findUnique({
        where: { id },
        include: orderInclude,
      }))!;
    });
  }
  @Post("shipments/:id/event") @Require("orders.manage") async shipment(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          status: z.enum(["in_transit", "delivered"]),
          message: z.string().min(2).max(1000),
          location: z.string().max(200).optional(),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      const shipment = await tx.shipment.update({
        where: { id },
        data: { status: i.status, events: { create: i } },
        include: { fulfillment: true },
      });
      if (i.status === "delivered") {
        const fulfillment = await tx.fulfillment.findUnique({
          where: { id: shipment.fulfillmentId },
          include: { shipments: true },
        });
        if (fulfillment?.shipments.every((s) => s.status === "delivered"))
          await tx.fulfillment.update({
            where: { id: fulfillment.id },
            data: { status: "delivered" },
          });
        const order = await tx.order.findUnique({
          where: { id: shipment.fulfillment.orderId },
          include: {
            items: { include: { fulfillmentItems: true } },
            fulfillments: true,
          },
        });
        if (
          order &&
          order.fulfillments.every((f) => f.status === "delivered") &&
          order.items.every(
            (item) =>
              item.fulfillmentItems.reduce((a, x) => a + x.quantity, 0) ===
              item.quantity,
          )
        )
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "completed",
              history: {
                create: {
                  status: "completed",
                  note: "All shipments delivered",
                  actorId: r.actor!.id,
                },
              },
            },
          });
      }
      await audit(tx, r, "shipment.update", "Shipment", id, i);
      return shipment;
    });
  }
  @Get("returns") @Require("orders.read") async returns(@Query() raw: unknown) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.returnRequest.findMany({
        include: {
          order: { select: { number: true, email: true } },
          items: { include: { orderItem: true } },
          events: true,
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.returnRequest.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("returns/:id/action") @Require("orders.manage") async returnAction(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          action: z.enum(["approve", "reject", "receive", "refund"]),
          restock: z.boolean().default(false),
        })
        .strict(),
      raw,
    );
    const rr = await db.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } } },
    });
    if (!rr) throw new NotFoundException("Return not found");
    if (i.action === "refund") {
      if (
        !r.actor!.permissions.includes("refunds.issue") &&
        !r.actor!.permissions.includes("*")
      )
        throw new BadRequestException("Refund permission required");
      if (rr.status !== "received")
        throw new BadRequestException("Return must be received before refund");
      const order = await db.order.findUnique({
        where: { id: rr.orderId },
        include: { payments: true },
      });
      const remaining =
        order?.payments.reduce(
          (a, p) => a + p.amountCents + p.giftCardCents - p.refundedCents,
          0,
        ) ?? 0;
      const amount = Math.min(
        remaining,
        rr.items.reduce(
          (a, x) => a + x.orderItem.unitPriceCents * x.quantity,
          0,
        ),
      );
      if (amount)
        await this.checkout.refund(
          r,
          rr.orderId,
          amount,
          `Return ${id}: ${rr.reason}`,
          `return-${id}`,
        );
    }
    return serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id=${id} FOR UPDATE`;
      const fresh = await tx.returnRequest.findUnique({
        where: { id },
        include: { items: { include: { orderItem: true } } },
      });
      if (!fresh) throw new NotFoundException("Return not found");
      const allowed: Record<string, string[]> = {
        requested: ["approve", "reject"],
        approved: ["receive"],
        received: ["refund"],
      };
      if (!allowed[fresh.status]?.includes(i.action))
        throw new BadRequestException("Invalid return action");
      const status = {
        approve: "approved",
        reject: "rejected",
        receive: "received",
        refund: "refunded",
      }[i.action];
      if (i.action === "receive" && i.restock) {
        for (const ri of fresh.items) {
          if (!ri.orderItem.variantId) continue;
          const stock = await tx.inventoryItem.findFirst({
            where: { variantId: ri.orderItem.variantId },
            orderBy: { id: "asc" },
          });
          if (stock) {
            await tx.inventoryItem.update({
              where: { id: stock.id },
              data: {
                onHand: { increment: ri.quantity },
                version: { increment: 1 },
              },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryItemId: stock.id,
                quantity: ri.quantity,
                kind: "return",
                reason: "Approved returned goods received",
                reference: id,
                actorId: r.actor!.id,
              },
            });
            await tx.returnItem.update({
              where: { id: ri.id },
              data: { restock: true },
            });
          }
        }
      }
      if (i.action === "reject") {
        const pending = await tx.returnRequest.count({
          where: {
            orderId: fresh.orderId,
            id: { not: id },
            status: { notIn: ["rejected", "refunded", "closed"] },
          },
        });
        if (!pending) {
          const previous = await tx.orderStatusHistory.findFirst({
            where: {
              orderId: fresh.orderId,
              status: { not: "return_requested" },
            },
            orderBy: { createdAt: "desc" },
          });
          if (previous)
            await tx.order.update({
              where: { id: fresh.orderId },
              data: {
                status: previous.status,
                history: {
                  create: {
                    status: previous.status,
                    note: "Return rejected; prior order state restored",
                    actorId: r.actor!.id,
                  },
                },
              },
            });
        }
      }
      const result = await tx.returnRequest.update({
        where: { id },
        data: {
          status,
          events: {
            create: {
              status,
              actorId: r.actor!.id,
              note: i.restock ? "Restocked" : "No restock",
            },
          },
        },
        include: { items: true, events: true },
      });
      await audit(tx, r, `return.${i.action}`, "ReturnRequest", id);
      return result;
    });
  }
  @Get("customers") @Require("customers.read") async customers(
    @Query() raw: unknown,
  ) {
    const q = parse(
      pageQuery.extend({
        q: z.string().optional(),
        search: z.string().optional(),
      }),
      raw,
    );
    const search = q.q ?? q.search;
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          emailVerifiedAt: true,
          roles: { include: { role: { select: { id: true, name: true } } } },
          profile: true,
          _count: { select: { orders: true } },
          loyalty: true,
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.user.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
}
