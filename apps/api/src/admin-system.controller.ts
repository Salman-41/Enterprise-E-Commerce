import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { prisma as db } from "@commerce/database";
import { z } from "zod";
import { CommerceRequest, Require } from "./security";
import { audit, parse, pageQuery } from "./helpers";
@Controller("admin")
@ApiTags("Admin system")
export class AdminSystemController {
  @Get("dashboard") @Require("analytics.read") async dashboard() {
    const paidStatuses = ["succeeded", "partially_refunded", "refunded"];
    const [
      payments,
      orders,
      customers,
      stock,
      topItems,
      recentOrders,
      failedPayments,
      pendingReturns,
      events,
    ] = await Promise.all([
      db.payment.aggregate({
        where: { status: { in: paidStatuses } },
        _sum: { amountCents: true, giftCardCents: true, refundedCents: true },
        _count: true,
      }),
      db.order.groupBy({ by: ["status"], _count: true }),
      db.user.count(),
      db.inventoryItem.findMany({
        include: { variant: { include: { product: true } }, warehouse: true },
        orderBy: { onHand: "asc" },
        take: 30,
      }),
      db.orderItem.groupBy({
        by: ["name"],
        where: { order: { paymentStatus: { in: paidStatuses } } },
        _sum: { quantity: true, totalCents: true },
        orderBy: { _sum: { totalCents: "desc" } },
        take: 8,
      }),
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { items: true },
      }),
      db.payment.count({ where: { status: "failed" } }),
      db.returnRequest.count({ where: { status: "requested" } }),
      db.analyticsEvent.groupBy({ by: ["type"], _count: true }),
    ]);
    const orderCount = orders.reduce((a, o) => a + o._count, 0);
    const revenue =
      (payments._sum.amountCents ?? 0) + (payments._sum.giftCardCents ?? 0);
    const refunds = payments._sum.refundedCents ?? 0;
    const lowStock = stock.filter(
      (i) => i.onHand - i.reserved <= i.lowStockThreshold,
    );
    const monthly = await db.$queryRaw<
      { date: string; revenue: number; orders: number }[]
    >`SELECT to_char(date_trunc('month',"createdAt"),'YYYY-MM') AS date, SUM("totalCents")::int AS revenue, count(*)::int AS orders FROM "Order" WHERE "paymentStatus" IN ('succeeded','partially_refunded','refunded') GROUP BY 1 ORDER BY 1`;
    return {
      revenueCents: revenue,
      netRevenueCents: revenue - refunds,
      refundsCents: refunds,
      orderCount,
      paidOrders: payments._count,
      averageOrderValueCents: payments._count
        ? Math.round(revenue / payments._count)
        : 0,
      customerCount: customers,
      failedPayments,
      pendingReturns,
      lowStock,
      topProducts: topItems.map((i) => ({
        name: i.name,
        quantity: i._sum.quantity,
        revenueCents: i._sum.totalCents,
      })),
      recentOrders,
      trend: monthly,
      ordersByStatus: orders.map((o) => ({
        status: o.status,
        count: o._count,
      })),
      funnel: events.map((e) => ({ type: e.type, count: e._count })),
      metrics: {
        revenue: revenue / 100,
        netRevenue: (revenue - refunds) / 100,
        orders: orderCount,
        customers,
        averageOrderValue: payments._count
          ? revenue / payments._count / 100
          : 0,
        refunds: refunds / 100,
      },
    };
  }
  @Get("audit") @Require("system.admin") async audit(@Query() raw: unknown) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.auditLog.count(),
    ]);
    return { items, total, ...q };
  }
  @Get("jobs") @Require("system.admin") async jobs(@Query() raw: unknown) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.jobRecord.findMany({
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.jobRecord.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("jobs/:id/retry") @Require("system.admin") async retryJob(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
  ) {
    const j = await db.jobRecord.update({
      where: { id },
      data: { status: "queued", error: null, attempts: 0, finishedAt: null },
    });
    await db.outboxEvent.create({
      data: { type: j.type, payload: j.payload ?? {} },
    });
    await audit(db, r, "job.retry", "JobRecord", id);
    return j;
  }
  @Get("webhooks") @Require("system.admin") async webhooks(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.webhookEvent.findMany({
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.webhookEvent.count(),
    ]);
    return { items, total, ...q };
  }
  @Get("roles") @Require("system.admin") async roles() {
    const items = await db.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return { items, total: items.length, page: 1, limit: 100 };
  }
  @Post("customers/:id/roles") @Require("system.admin") async assignRole(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const { roleIds } = parse(
      z.object({ roleIds: z.array(z.string()).min(1).max(10) }).strict(),
      raw,
    );
    if (id === r.actor!.id)
      throw new BadRequestException("You cannot change your own roles");
    return db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      });
      await audit(tx, r, "roles.assign", "User", id, { roleIds });
      return { ok: true };
    });
  }
  @Get("featureflags") @Require("system.admin") async flags() {
    const items = await db.featureFlag.findMany();
    return { items, total: items.length, page: 1, limit: 100 };
  }
  @Patch("featureflags/:id") @Require("system.admin") async flag(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(z.object({ enabled: z.boolean() }).strict(), raw);
    const f = await db.featureFlag.update({ where: { id }, data: i });
    await audit(db, r, "featureflag.update", "FeatureFlag", id, i);
    return f;
  }
  @Get("health") @Require("system.admin") async health() {
    await db.$queryRaw`SELECT 1`;
    const [outboxPending, failedJobs] = await Promise.all([
      db.outboxEvent.count({ where: { processedAt: null } }),
      db.jobRecord.count({ where: { status: "failed" } }),
    ]);
    return {
      status: "ok",
      database: "connected",
      outboxPending,
      failedJobs,
      uptime: process.uptime(),
    };
  }
  @Get("giftcards") @Require("promotions.manage") async gifts(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.giftCard.findMany({
        include: { ledger: true },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.giftCard.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("giftcards") @Require("promotions.manage") async gift(
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(
      z
        .object({
          code: z.string().min(8).max(64),
          initialCents: z.number().int().min(100),
          expiresAt: z.coerce.date().optional(),
        })
        .strict(),
      raw,
    );
    const g = await db.giftCard.create({
      data: {
        ...i,
        balanceCents: i.initialCents,
        ledger: {
          create: {
            amountCents: i.initialCents,
            reason: "issue",
            reference: `issue:${i.code}`,
          },
        },
      },
    });
    await audit(db, r, "giftcard.issue", "GiftCard", g.id, {
      initialCents: i.initialCents,
    });
    return g;
  }
  @Get("loyalty") @Require("customers.read") async loyalty(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.loyaltyAccount.findMany({
        include: {
          user: { select: { name: true, email: true } },
          ledger: { take: 10, orderBy: { createdAt: "desc" } },
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      db.loyaltyAccount.count(),
    ]);
    return { items, total, ...q };
  }
}
