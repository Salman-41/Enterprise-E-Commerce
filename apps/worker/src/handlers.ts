import { PrismaClient, Prisma } from "@commerce/database";
import {
  ProductSearch,
  SmtpEmailProvider,
  ObjectStorage,
  type EmailMessage,
} from "@commerce/integrations";
import { randomUUID } from "node:crypto";

export type CommerceEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};
function required(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value)
    throw new Error(`Event field ${key} is required`);
  return value;
}
function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${/^[=+@\-\t\r]/.test(text) ? "'" : ""}${text.replaceAll('"', '""')}"`;
}

export class Handlers {
  constructor(
    private readonly db: PrismaClient,
    private readonly search: ProductSearch,
    private readonly email: SmtpEmailProvider,
    private readonly storage?: ObjectStorage,
  ) {}
  async deliver(id: string, message: EmailMessage, template: string) {
    const record = await this.db.emailDelivery.upsert({
      where: { idempotencyKey: id },
      create: {
        idempotencyKey: id,
        to: message.to,
        subject: message.subject,
        template,
        payload: message as Prisma.InputJsonValue,
      },
      update: {},
    });
    if (record.status === "sent") return;
    try {
      const result = await this.email.send(message, id);
      await this.db.emailDelivery.update({
        where: { id: record.id },
        data: { status: "sent", providerId: result.messageId, error: null },
      });
    } catch (error) {
      await this.db.emailDelivery.update({
        where: { id: record.id },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Delivery failed",
        },
      });
      throw error;
    }
  }
  async index(productId: string) {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      include: {
        brand: true,
        categories: { include: { category: true } },
        variants: { include: { inventory: true } },
        reviews: { where: { status: "approved" } },
      },
    });
    if (
      !product ||
      product.status !== "published" ||
      (product.publishAt && product.publishAt > new Date())
    ) {
      await this.search.remove(productId);
      return;
    }
    const available = product.variants.some(
      (variant) =>
        variant.backorder ||
        variant.inventory.some(
          (item) => item.onHand - item.reserved - item.safetyStock > 0,
        ),
    );
    await this.search.upsert([
      {
        id: product.id,
        title: product.name,
        slug: product.slug,
        description: product.description.replace(/<[^>]*>/g, ""),
        brand: product.brand.name,
        category: product.categories[0]?.category.name ?? "Uncategorized",
        priceCents: Math.min(
          product.priceCents,
          ...product.variants.map((variant) => variant.priceCents),
        ),
        rating: product.reviews.length
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
            product.reviews.length
          : 0,
        available,
        tags: product.tags,
        sku: product.variants.map((variant) => variant.sku),
        options: product.variants.flatMap((variant) =>
          Object.values(variant.options as Record<string, string>),
        ),
      },
    ]);
  }
  async reindex() {
    await this.search.clear();
    // Clear stale/deleted products, then include drafts to preserve publication checks. Database reads remain the fallback during rebuild.
    let cursor: string | undefined;
    while (true) {
      const products: { id: string }[] = await this.db.product.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!products.length) break;
      for (const product of products) await this.index(product.id);
      cursor = products.at(-1)?.id;
    }
  }
  async expireReservations() {
    return this.db.$transaction(async (tx) => {
      const reservations = await tx.$queryRaw<
        {
          id: string;
          inventoryItemId: string;
          quantity: number;
          orderId: string | null;
        }[]
      >`SELECT "id", "inventoryItemId", "quantity", "orderId" FROM "InventoryReservation" WHERE "status"='active' AND "expiresAt" < NOW() ORDER BY "id" LIMIT 100 FOR UPDATE SKIP LOCKED`;
      for (const reservation of reservations) {
        // Locks serialize with payment commitment. Only a successfully claimed active reservation releases stock.
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: "active" },
          data: { status: "released" },
        });
        if (!claimed.count) continue;
        const released = await tx.inventoryItem.updateMany({
          where: {
            id: reservation.inventoryItemId,
            reserved: { gte: reservation.quantity },
          },
          data: {
            reserved: { decrement: reservation.quantity },
            version: { increment: 1 },
          },
        });
        if (!released.count)
          throw new Error("Reservation accounting invariant violated");
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: reservation.inventoryItemId,
            quantity: reservation.quantity,
            kind: "release",
            reason: "Reservation expired",
            reference: reservation.id,
          },
        });
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: reservation.inventoryItemId },
          include: { variant: true },
        });
        await tx.outboxEvent.create({
          data: {
            type: "inventory.changed",
            payload: { productId: item.variant.productId },
          },
        });
      }
      return reservations.length;
    });
  }
  async stockAlerts(event: CommerceEvent, productId: string) {
    const variants = await this.db.productVariant.findMany({
      where: { productId, product: { status: "published" } },
      include: { inventory: true, product: true },
    });
    for (const variant of variants) {
      if (
        !variant.inventory.some(
          (item) => item.onHand - item.reserved - item.safetyStock > 0,
        )
      )
        continue;
      const subscriptions = await this.db.backInStockSubscription.findMany({
        where: { variantId: variant.id, notifiedAt: null },
        take: 500,
      });
      for (const sub of subscriptions) {
        await this.deliver(
          `${event.id}-${sub.id}`,
          {
            to: sub.email,
            subject: `${variant.product.name} is back in stock`,
            text: `Your requested item is available again. Visit ${process.env.WEB_URL ?? "http://localhost:3000"}/product/${variant.product.slug}. Availability may change.`,
          },
          "back-in-stock",
        );
        await this.db.backInStockSubscription.update({
          where: { id: sub.id },
          data: { notifiedAt: new Date() },
        });
      }
    }
  }
  async abandonedCarts() {
    const older = new Date(Date.now() - 24 * 3600_000);
    const oldest = new Date(Date.now() - 7 * 86400_000);
    const carts = await this.db.cart.findMany({
      where: {
        updatedAt: { lt: older, gt: oldest },
        userId: { not: null },
        items: { some: { savedForLater: false } },
      },
      include: { user: { include: { profile: true } } },
      take: 100,
    });
    for (const cart of carts) {
      if (
        !cart.user ||
        cart.user.status !== "active" ||
        !cart.user.emailVerifiedAt ||
        (cart.user.profile?.preferences as Record<string, unknown> | undefined)
          ?.marketingEmails !== true
      )
        continue;
      const key = `abandoned-${cart.id}-${cart.updatedAt.getTime()}`;
      const bought = await this.db.order.count({
        where: { userId: cart.user.id, createdAt: { gt: cart.updatedAt } },
      });
      if (bought) continue;
      await this.deliver(
        key,
        {
          to: cart.user.email,
          subject: "Your cart is still here",
          text: `You can review your cart at ${process.env.WEB_URL ?? "http://localhost:3000"}/cart. Prices and availability are checked at checkout.`,
        },
        "abandoned-cart",
      );
    }
  }
  async exportOrders(event: CommerceEvent) {
    if (!this.storage) throw new Error("Object storage is not configured");
    const userId = required(event.payload, "requestedBy");
    const chunks = ["number,status,currency,totalCents,createdAt\n"];
    let cursor: string | undefined;
    let count = 0;
    do {
      const orders = await this.db.order.findMany({
        orderBy: { id: "asc" },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          number: true,
          status: true,
          currency: true,
          totalCents: true,
          createdAt: true,
        },
      });
      for (const order of orders)
        chunks.push(
          [
            order.number,
            order.status,
            order.currency,
            order.totalCents,
            order.createdAt.toISOString(),
          ]
            .map(csv)
            .join(",") + "\n",
        );
      count += orders.length;
      cursor = orders.length === 500 ? orders.at(-1)?.id : undefined;
      if (count > 100_000)
        throw new Error(
          "Export exceeds local 100000-order bound; use warehouse export",
        );
    } while (cursor);
    const key = `exports/${userId}/${event.id}.csv`;
    await this.storage.put(key, Buffer.from(chunks.join("")), "text/csv");
    await this.db.notification.upsert({
      where: { id: `export-${event.id}` },
      create: {
        id: `export-${event.id}`,
        userId,
        type: "export",
        title: "Orders export ready",
        body: key,
      },
      update: {},
    });
  }
  async process(event: CommerceEvent) {
    switch (event.type) {
      case "email.send":
        await this.deliver(
          event.id,
          {
            to: required(event.payload, "to"),
            subject: required(event.payload, "subject"),
            text: required(event.payload, "text"),
            ...(typeof event.payload.html === "string"
              ? { html: event.payload.html }
              : {}),
          },
          String(event.payload.template ?? "transactional"),
        );
        return;
      case "catalog.changed":
        await this.index(required(event.payload, "productId"));
        return;
      case "inventory.changed": {
        const productId = required(event.payload, "productId");
        await this.index(productId);
        await this.stockAlerts(event, productId);
        return;
      }
      case "search.reindex":
        await this.reindex();
        return;
      case "reservations.expire":
        await this.expireReservations();
        return;
      case "carts.remind":
        await this.abandonedCarts();
        return;
      case "export.orders":
        await this.exportOrders(event);
        return;
      case "order.placed":
      case "order.shipped": {
        const order = await this.db.order.findUniqueOrThrow({
          where: { id: required(event.payload, "orderId") },
        });
        await this.deliver(
          event.id,
          {
            to: order.email,
            subject:
              event.type === "order.placed"
                ? `Order ${order.number} received`
                : `Order ${order.number} shipped`,
            text: `Order ${order.number}: ${order.status}. Track your order at ${process.env.WEB_URL ?? "http://localhost:3000"}/track/${order.trackingToken}`,
          },
          event.type,
        );
        return;
      }
      default:
        throw new Error(`Unsupported event type: ${event.type}`);
    }
  }
}
export function scheduledEvent(type: string): CommerceEvent {
  return { id: randomUUID(), type, payload: {} };
}
