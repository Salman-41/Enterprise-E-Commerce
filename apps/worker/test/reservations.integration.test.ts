import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@commerce/database";
import { ProductSearch, SmtpEmailProvider } from "@commerce/integrations";
import { randomUUID } from "node:crypto";
import { Handlers } from "../src/handlers.js";

// Explicit opt-in: requires an isolated migrated PostgreSQL database; never targets production implicitly.
const enabled = process.env.TEST_DATABASE_URL !== undefined;
describe.skipIf(!enabled)("reservation expiration against PostgreSQL", () => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const fixture = `worker-${randomUUID()}`;
  const handlers = new Handlers(
    db,
    new ProductSearch("http://localhost:7700", ""),
    new SmtpEmailProvider("test@commerce.local", "smtp://localhost:1025"),
  );
  beforeAll(async () => {
    await db.brand.create({
      data: { id: fixture, slug: fixture, name: "Worker test" },
    });
    await db.product.create({
      data: {
        id: fixture,
        slug: fixture,
        name: "Worker test",
        description: "Integration fixture",
        brandId: fixture,
        priceCents: 1000,
        imageUrl: "/fixture.webp",
      },
    });
    await db.productVariant.create({
      data: {
        id: fixture,
        productId: fixture,
        sku: fixture,
        name: "Default",
        priceCents: 1000,
      },
    });
    await db.warehouse.create({
      data: { id: fixture, name: "Test", code: fixture, address: "Test" },
    });
    await db.inventoryItem.create({
      data: {
        id: fixture,
        variantId: fixture,
        warehouseId: fixture,
        onHand: 10,
        reserved: 2,
      },
    });
    await db.inventoryReservation.create({
      data: {
        id: `${fixture}-expired`,
        inventoryItemId: fixture,
        quantity: 2,
        expiresAt: new Date(Date.now() - 3600000),
      },
    });
    await db.inventoryReservation.create({
      data: {
        id: `${fixture}-committed`,
        inventoryItemId: fixture,
        quantity: 1,
        status: "committed",
        expiresAt: new Date(Date.now() - 3600000),
      },
    });
  });
  afterAll(async () => {
    await db.outboxEvent.deleteMany({
      where: { payload: { path: ["productId"], equals: fixture } },
    });
    await db.inventoryMovement.deleteMany({
      where: { inventoryItemId: fixture },
    });
    await db.inventoryReservation.deleteMany({
      where: { inventoryItemId: fixture },
    });
    await db.inventoryItem.deleteMany({ where: { id: fixture } });
    await db.productVariant.deleteMany({ where: { id: fixture } });
    await db.product.deleteMany({ where: { id: fixture } });
    await db.warehouse.deleteMany({ where: { id: fixture } });
    await db.brand.deleteMany({ where: { id: fixture } });
    await db.$disconnect();
  });
  it("concurrent cleanup releases exactly once and preserves committed reservations", async () => {
    await Promise.all([
      handlers.expireReservations(),
      handlers.expireReservations(),
    ]);
    const inventory = await db.inventoryItem.findUniqueOrThrow({
      where: { id: fixture },
    });
    expect(inventory.onHand).toBe(10);
    expect(inventory.reserved).toBe(0);
    expect(
      (
        await db.inventoryReservation.findUniqueOrThrow({
          where: { id: `${fixture}-expired` },
        })
      ).status,
    ).toBe("released");
    expect(
      (
        await db.inventoryReservation.findUniqueOrThrow({
          where: { id: `${fixture}-committed` },
        })
      ).status,
    ).toBe("committed");
    expect(
      await db.inventoryMovement.count({
        where: { inventoryItemId: fixture, kind: "release" },
      }),
    ).toBe(1);
    await handlers.expireReservations();
    expect(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: fixture } }))
        .reserved,
    ).toBe(0);
  });
});
