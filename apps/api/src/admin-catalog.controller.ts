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
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { prisma as db, Prisma } from "@commerce/database";
import { z } from "zod";
import { CommerceRequest, Require } from "./security";
import { audit, emit, parse, pageQuery, serial } from "./helpers";
import { productInclude, productView } from "./catalog.controller";
const variant = z
  .object({
    sku: z.string().min(2).max(100),
    name: z.string().min(1).max(100),
    priceCents: z.number().int().min(1),
    compareAtPriceCents: z.number().int().min(0).nullable().optional(),
    options: z.record(z.string(), z.string()).default({}),
    backorder: z.boolean().default(false),
  })
  .strict();
const product = z
  .object({
    name: z.string().min(2).max(200),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().max(10000),
    status: z.enum(["published", "draft", "archived"]).default("draft"),
    priceCents: z.number().int().min(1),
    compareAtPriceCents: z.number().int().min(0).nullable().optional(),
    brandId: z.string(),
    imageUrl: z.string().min(1).max(1000),
    featured: z.boolean().default(false),
    categoryIds: z.array(z.string()).default([]),
    collectionIds: z.array(z.string()).default([]),
    variants: z.array(variant).min(1),
    tags: z.array(z.string()).default([]),
  })
  .strict();
@Controller("admin")
@ApiTags("Admin catalog")
export class AdminCatalogController {
  @Get("products") @Require("catalog.read") async list(@Query() raw: unknown) {
    const q = parse(
      pageQuery.extend({
        q: z.string().optional(),
        status: z.string().optional(),
      }),
      raw,
    );
    const where: Prisma.ProductWhereInput = {
      name: q.q ? { contains: q.q, mode: "insensitive" } : undefined,
      status: q.status,
    };
    const [items, total] = await Promise.all([
      db.product.findMany({
        where,
        include: productInclude,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { updatedAt: "desc" },
      }),
      db.product.count({ where }),
    ]);
    return {
      items: items.map(productView),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  @Get("products/:id") @Require("catalog.read") async one(
    @Param("id") id: string,
  ) {
    const p = await db.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!p) throw new NotFoundException("Product not found");
    return productView(p);
  }
  @Post("products") @Require("catalog.write") async create(
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(product, raw);
    return serial(async (tx) => {
      const { categoryIds, collectionIds, variants, ...fields } = i;
      const p = await tx.product.create({
        data: {
          ...fields,
          variants: { create: variants },
          categories: {
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
          collections: {
            create: collectionIds.map((collectionId) => ({ collectionId })),
          },
        },
        include: productInclude,
      });
      const warehouse = await tx.warehouse.findFirst();
      if (warehouse)
        for (const v of p.variants)
          await tx.inventoryItem.create({
            data: { variantId: v.id, warehouseId: warehouse.id, onHand: 0 },
          });
      await audit(tx, r, "catalog.create", "Product", p.id, { name: p.name });
      await emit(tx, "catalog.changed", { productId: p.id });
      return productView(p);
    });
  }
  @Patch("products/:id") @Require("catalog.write") async update(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(
      product.omit({ variants: true }).partial().extend({
        version: z.number().int().optional(),
        title: z.string().optional(),
      }),
      raw,
    );
    return serial(async (tx) => {
      const p = await tx.product.findUnique({ where: { id } });
      if (!p) throw new NotFoundException("Product not found");
      if (i.version !== undefined && i.version !== p.version)
        throw new ConflictException("Product changed; reload before saving");
      const {
        version: _version,
        title,
        categoryIds,
        collectionIds,
        ...fields
      } = i;
      if (categoryIds) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        await tx.productCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            productId: id,
            categoryId,
          })),
        });
      }
      if (collectionIds) {
        await tx.productCollection.deleteMany({ where: { productId: id } });
        await tx.productCollection.createMany({
          data: collectionIds.map((collectionId) => ({
            productId: id,
            collectionId,
          })),
        });
      }
      const result = await tx.product.update({
        where: { id },
        data: {
          ...fields,
          name: title ?? fields.name,
          version: { increment: 1 },
        },
        include: productInclude,
      });
      await audit(tx, r, "catalog.update", "Product", id, {
        name: result.name,
        status: result.status,
      });
      await emit(tx, "catalog.changed", { productId: id });
      return productView(result);
    });
  }
  @Patch("variants/:id") @Require("catalog.write") async variant(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(variant.partial(), raw);
    return serial(async (tx) => {
      const v = await tx.productVariant.update({ where: { id }, data: i });
      if (i.priceCents !== undefined)
        await tx.priceHistory.create({
          data: {
            variantId: id,
            priceCents: i.priceCents,
            compareAtPriceCents: i.compareAtPriceCents,
            actorId: r.actor!.id,
          },
        });
      await audit(tx, r, "variant.update", "ProductVariant", id);
      await emit(tx, "catalog.changed", { productId: v.productId });
      return v;
    });
  }
  @Get("inventory") @Require("inventory.manage") async inventory(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery.extend({ q: z.string().optional() }), raw);
    const where: Prisma.InventoryItemWhereInput = q.q
      ? {
          variant: {
            OR: [
              { sku: { contains: q.q, mode: "insensitive" } },
              { product: { name: { contains: q.q, mode: "insensitive" } } },
            ],
          },
        }
      : {};
    const [items, total] = await Promise.all([
      db.inventoryItem.findMany({
        where,
        include: { warehouse: true, variant: { include: { product: true } } },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { updatedAt: "desc" },
      }),
      db.inventoryItem.count({ where }),
    ]);
    return {
      items: items.map((i) => ({
        ...i,
        available: i.onHand - i.reserved - i.safetyStock,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  @Post("inventory/:id/adjust") @Require("inventory.manage") async adjust(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(
      z
        .object({
          delta: z.number().int().min(-100000).max(100000),
          reason: z.string().min(5).max(1000),
          version: z.number().int(),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id=${id} FOR UPDATE`;
      const item = await tx.inventoryItem.findUnique({
        where: { id },
        include: { variant: true },
      });
      if (!item) throw new NotFoundException("Inventory not found");
      if (item.version !== i.version)
        throw new ConflictException(
          "Inventory changed; reload before adjusting",
        );
      if (item.onHand + i.delta < item.reserved)
        throw new BadRequestException("Cannot reduce below reserved stock");
      const updated = await tx.inventoryItem.update({
        where: { id },
        data: { onHand: { increment: i.delta }, version: { increment: 1 } },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: id,
          quantity: i.delta,
          kind: "adjustment",
          reason: i.reason,
          actorId: r.actor!.id,
        },
      });
      await audit(tx, r, "inventory.adjust", "InventoryItem", id, {
        delta: i.delta,
        reason: i.reason,
      });
      await emit(tx, "inventory.changed", {
        productId: item.variant.productId,
      });
      return updated;
    });
  }
  @Get("inventory/:id/movements") @Require("inventory.manage") async movements(
    @Param("id") id: string,
  ) {
    return {
      items: await db.inventoryMovement.findMany({
        where: { inventoryItemId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  }
  @Get("warehouses") @Require("inventory.manage") async warehouses() {
    return { items: await db.warehouse.findMany() };
  }
  @Get("promotions") @Require("promotions.manage") async promotions(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.promotion.findMany({
        include: { coupons: true, rules: true },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.promotion.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("promotions") @Require("promotions.manage") async createPromotion(
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(promotionSchema, raw);
    return serial(async (tx) => {
      const { code, ...fields } = i;
      const p = await tx.promotion.create({
        data: {
          ...fields,
          coupons: code ? { create: { code: code.toUpperCase() } } : undefined,
        },
        include: { coupons: true },
      });
      await audit(tx, r, "promotion.create", "Promotion", p.id);
      return p;
    });
  }
  @Patch("promotions/:id") @Require("promotions.manage") async editPromotion(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(promotionSchema.omit({ code: true }).partial(), raw);
    return serial(async (tx) => {
      const result = await tx.promotion.update({
        where: { id },
        data: i,
        include: { coupons: true },
      });
      await audit(tx, r, "promotion.update", "Promotion", id);
      return result;
    });
  }
  @Get("reviews") @Require("reviews.manage") async reviews(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.review.findMany({
        include: {
          product: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { createdAt: "desc" },
      }),
      db.review.count(),
    ]);
    return { items, total, ...q };
  }
  @Patch("reviews/:id") @Require("reviews.manage") async review(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(
      z
        .object({ status: z.enum(["approved", "rejected", "pending"]) })
        .strict(),
      raw,
    );
    const result = await db.review.update({ where: { id }, data: i });
    await audit(db, r, "review.moderate", "Review", id, i);
    return result;
  }
  @Get("content") @Require("content.manage") async content() {
    const items = await db.cmsPage.findMany();
    return { items, total: items.length, page: 1, limit: 100 };
  }
  @Patch("content/:id") @Require("content.manage") async updateContent(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() r: CommerceRequest,
  ) {
    const i = parse(
      z
        .object({
          title: z.string().min(2).max(200).optional(),
          body: z.string().max(20000).optional(),
          published: z.boolean().optional(),
        })
        .strict(),
      raw,
    );
    const result = await db.cmsPage.update({ where: { id }, data: i });
    await audit(db, r, "content.update", "CmsPage", id);
    return result;
  }
}
const promotionSchema = z
  .object({
    name: z.string().min(2).max(100),
    kind: z.enum(["percent", "fixed", "free_shipping", "bogo"]),
    value: z.number().int().min(0).max(10000000),
    minimumSpendCents: z.number().int().min(0).default(0),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perCustomerLimit: z.number().int().min(1).default(1),
    active: z.boolean().default(true),
    automatic: z.boolean().default(false),
    stackable: z.boolean().default(false),
    code: z
      .string()
      .regex(/^[A-Za-z0-9-]+$/)
      .optional(),
  })
  .strict();
