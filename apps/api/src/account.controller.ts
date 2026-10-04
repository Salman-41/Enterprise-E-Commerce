import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  Query,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { prisma as db } from "@commerce/database";
import { z } from "zod";
import { CommerceRequest, Require } from "./security";
import { parse, pageQuery, orderInclude, serial, audit } from "./helpers";
import { addressSchema } from "./checkout.controller";
import { productInclude, productView } from "./catalog.controller";
@Controller("account")
@ApiTags("Customer account")
@Require()
export class AccountController {
  @Get("profile") async profile(@Req() r: CommerceRequest) {
    return db.user.findUnique({
      where: { id: r.actor!.id },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        profile: { select: { preferences: true } },
        loyalty: {
          include: { ledger: { take: 20, orderBy: { createdAt: "desc" } } },
        },
      },
    });
  }
  @Patch("profile") async updateProfile(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          name: z.string().min(2).max(100),
          marketingEmails: z.boolean().optional(),
        })
        .strict(),
      raw,
    );
    await db.user.update({
      where: { id: r.actor!.id },
      data: { name: i.name },
    });
    if (i.marketingEmails !== undefined)
      await db.customerProfile.upsert({
        where: { userId: r.actor!.id },
        create: {
          userId: r.actor!.id,
          preferences: { marketingEmails: i.marketingEmails },
        },
        update: { preferences: { marketingEmails: i.marketingEmails } },
      });
    return { ok: true };
  }
  @Get("orders") async orders(
    @Req() r: CommerceRequest,
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const where = { userId: r.actor!.id };
    const [items, total] = await Promise.all([
      db.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      db.order.count({ where }),
    ]);
    return { items, total, ...q };
  }
  @Get("orders/:id") async order(
    @Req() r: CommerceRequest,
    @Param("id") id: string,
  ) {
    const o = await db.order.findFirst({
      where: { id, userId: r.actor!.id },
      include: orderInclude,
    });
    if (!o) throw new NotFoundException("Order not found");
    return o;
  }
  @Post("orders/:id/return") async returnOrder(
    @Req() r: CommerceRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const input = parse(
      z
        .object({
          reason: z.string().min(5).max(1000),
          resolution: z.enum(["refund", "exchange"]).default("refund"),
          items: z
            .array(
              z.object({
                orderItemId: z.string(),
                quantity: z.number().int().min(1),
              }),
            )
            .min(1),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      const o = await tx.order.findFirst({
        where: { id, userId: r.actor!.id },
        include: { items: true, returns: { include: { items: true } } },
      });
      if (!o) throw new NotFoundException("Order not found");
      if (
        ![
          "paid",
          "processing",
          "fulfilled",
          "completed",
          "partially_fulfilled",
          "partially_refunded",
        ].includes(o.status)
      )
        throw new BadRequestException("Order is not eligible for a return");
      if (Date.now() - o.createdAt.getTime() > 30 * 86400000)
        throw new BadRequestException("30-day return window has closed");
      const seen = new Set<string>();
      for (const i of input.items) {
        if (seen.has(i.orderItemId))
          throw new BadRequestException("Duplicate return item");
        seen.add(i.orderItemId);
        const oi = o.items.find((x) => x.id === i.orderItemId);
        const previously = o.returns
          .filter((x) => x.status !== "rejected")
          .flatMap((x) => x.items)
          .filter((x) => x.orderItemId === i.orderItemId)
          .reduce((a, x) => a + x.quantity, 0);
        if (!oi || i.quantity + previously > oi.quantity)
          throw new BadRequestException(
            "Return quantity exceeds eligible purchased quantity",
          );
      }
      const result = await tx.returnRequest.create({
        data: {
          orderId: id,
          reason: input.reason,
          resolution: input.resolution,
          items: { create: input.items },
          events: {
            create: {
              status: "requested",
              note: input.reason,
              actorId: r.actor!.id,
            },
          },
        },
        include: { items: true, events: true },
      });
      await tx.order.update({
        where: { id },
        data: {
          status: "return_requested",
          history: {
            create: { status: "return_requested", note: input.reason },
          },
        },
      });
      await audit(tx, r, "return.request", "ReturnRequest", result.id);
      return result;
    });
  }
  @Get("addresses") async addresses(@Req() r: CommerceRequest) {
    return {
      items: await db.address.findMany({ where: { userId: r.actor!.id } }),
    };
  }
  @Post("addresses") async addAddress(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const input = parse(
      addressSchema.extend({
        label: z.string().max(100).default("Home"),
        isDefault: z.boolean().default(false),
      }),
      raw,
    );
    return db.address.create({ data: { ...input, userId: r.actor!.id } });
  }
  @Delete("addresses/:id") async deleteAddress(
    @Req() r: CommerceRequest,
    @Param("id") id: string,
  ) {
    await db.address.deleteMany({ where: { id, userId: r.actor!.id } });
    return { ok: true };
  }
  @Get("wishlist") async wishlist(@Req() r: CommerceRequest) {
    const lists = await db.wishlist.findMany({
      where: { userId: r.actor!.id },
      include: { items: true },
    });
    const ids = lists.flatMap((l) => l.items.map((i) => i.productId));
    return {
      items: (
        await db.product.findMany({
          where: { id: { in: ids }, status: "published" },
          include: productInclude,
        })
      ).map(productView),
    };
  }
  @Post("wishlist") async addWishlist(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const { productId } = parse(
      z.object({ productId: z.string() }).strict(),
      raw,
    );
    if (!(await db.product.findUnique({ where: { id: productId } })))
      throw new NotFoundException("Product not found");
    let list = await db.wishlist.findFirst({ where: { userId: r.actor!.id } });
    list ??= await db.wishlist.create({ data: { userId: r.actor!.id } });
    await db.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: list.id, productId } },
      create: { wishlistId: list.id, productId },
      update: {},
    });
    return { ok: true };
  }
  @Delete("wishlist/:id") async removeWishlist(
    @Req() r: CommerceRequest,
    @Param("id") productId: string,
  ) {
    await db.wishlistItem.deleteMany({
      where: { productId, wishlist: { userId: r.actor!.id } },
    });
    return { ok: true };
  }
  @Post("reviews") async review(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          productId: z.string(),
          rating: z.number().int().min(1).max(5),
          title: z.string().min(3).max(100),
          body: z.string().min(10).max(3000),
        })
        .strict(),
      raw,
    );
    const purchase = await db.orderItem.findFirst({
      where: {
        productId: i.productId,
        order: {
          userId: r.actor!.id,
          paymentStatus: {
            in: ["succeeded", "partially_refunded", "refunded"],
          },
        },
      },
    });
    if (!purchase)
      throw new BadRequestException("Reviews require a verified purchase");
    return db.review.upsert({
      where: {
        productId_userId: { productId: i.productId, userId: r.actor!.id },
      },
      create: {
        ...i,
        userId: r.actor!.id,
        verifiedPurchase: true,
        status: "pending",
      },
      update: {
        rating: i.rating,
        title: i.title,
        body: i.body,
        status: "pending",
      },
    });
  }
  @Post("questions") async question(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          productId: z.string(),
          question: z.string().min(5).max(1000),
        })
        .strict(),
      raw,
    );
    return db.productQuestion.create({
      data: { ...i, userId: r.actor!.id, status: "pending" },
    });
  }
  @Get("rewards") async rewards(@Req() r: CommerceRequest) {
    const loyalty = await db.loyaltyAccount.findUnique({
      where: { userId: r.actor!.id },
      include: { ledger: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    return {
      loyaltyPoints: loyalty?.points ?? 0,
      ledger: loyalty?.ledger ?? [],
      giftCards: [],
    };
  }
  @Patch("preferences") async preferences(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const { newsletter } = parse(
      z.object({ newsletter: z.boolean() }).strict(),
      raw,
    );
    await db.customerProfile.upsert({
      where: { userId: r.actor!.id },
      create: {
        userId: r.actor!.id,
        preferences: { marketingEmails: newsletter },
      },
      update: { preferences: { marketingEmails: newsletter } },
    });
    return { ok: true };
  }
  @Get("notifications") async notifications(@Req() r: CommerceRequest) {
    return {
      items: await db.notification.findMany({
        where: { userId: r.actor!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    };
  }
  @Patch("notifications/:id") async notification(
    @Req() r: CommerceRequest,
    @Param("id") id: string,
  ) {
    await db.notification.updateMany({
      where: { id, userId: r.actor!.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
@Controller("orders")
@ApiTags("Order tracking")
export class TrackingController {
  @Get(":id") async get(
    @Req() r: CommerceRequest,
    @Param("id") id: string,
    @Query("token") token?: string,
  ) {
    const order = await db.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (
      !order ||
      (order.userId !== r.actor?.id && order.trackingToken !== token)
    )
      throw new NotFoundException("Order not found");
    return order;
  }
  @Get("track/:token") async track(@Param("token") token: string) {
    const o = await db.order.findUnique({
      where: { trackingToken: token },
      include: {
        history: true,
        fulfillments: { include: { shipments: { include: { events: true } } } },
      },
    });
    if (!o) throw new NotFoundException("Tracking link not found");
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      createdAt: o.createdAt,
      history: o.history,
      fulfillments: o.fulfillments,
    };
  }
}
