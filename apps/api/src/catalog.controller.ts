import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  NotFoundException,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Prisma, prisma as db } from "@commerce/database";
import { z } from "zod";
import { parse, pageQuery, emit } from "./helpers";
import { CommerceRequest } from "./security";
export const productInclude = {
  brand: true,
  categories: { include: { category: true } },
  collections: { include: { collection: true } },
  media: { orderBy: { position: "asc" as const } },
  variants: { include: { inventory: true } },
  reviews: {
    where: { status: "approved" },
    include: { user: { select: { name: true } } },
  },
};
export type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;
export function productView(p: ProductRecord) {
  const rating = p.reviews.length
    ? p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length
    : 0;
  return {
    ...p,
    title: p.name,
    price: p.priceCents / 100,
    compareAtPrice: p.compareAtPriceCents ? p.compareAtPriceCents / 100 : null,
    images: p.media.length ? p.media.map((m) => m.url) : [p.imageUrl],
    rating,
    reviewCount: p.reviews.length,
    categories: p.categories.map((c) => c.category),
    collections: p.collections.map((c) => c.collection),
    variants: p.variants.map((v) => ({
      ...v,
      price: v.priceCents / 100,
      stock: v.inventory.reduce(
        (a, i) => a + Math.max(0, i.onHand - i.reserved - i.safetyStock),
        0,
      ),
      inventory: undefined,
    })),
    reviews: p.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verifiedPurchase: r.verifiedPurchase,
      createdAt: r.createdAt,
      author: r.user.name,
    })),
  };
}
const querySchema = pageQuery.extend({
  q: z.string().max(200).optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z
    .enum(["featured", "newest", "price-asc", "price-desc", "rating"])
    .default("featured"),
  inStock: z.string().optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  color: z.string().optional(),
  size: z.string().optional(),
});
@Controller("catalog")
@ApiTags("Catalog")
export class CatalogController {
  @Get("products") async products(@Query() raw: unknown) {
    const q = parse(querySchema, raw);
    const predicates: Prisma.Sql[] = [
      Prisma.sql`p.status='published' AND (p."publishAt" IS NULL OR p."publishAt" <= NOW())`,
    ];
    if (q.q)
      predicates.push(
        Prisma.sql`(p.name ILIKE ${"%" + q.q + "%"} OR p.description ILIKE ${"%" + q.q + "%"} OR EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND v.sku ILIKE ${"%" + q.q + "%"}))`,
      );
    if (q.category)
      predicates.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "ProductCategory" pc JOIN "Category" c ON c.id=pc."categoryId" WHERE pc."productId"=p.id AND (c.slug=${q.category} OR c.id=${q.category}))`,
      );
    if (q.collection)
      predicates.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "ProductCollection" pc JOIN "Collection" c ON c.id=pc."collectionId" WHERE pc."productId"=p.id AND c.slug=${q.collection})`,
      );
    if (q.brand)
      predicates.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "Brand" b WHERE b.id=p."brandId" AND (b.slug=${q.brand} OR b.id=${q.brand}))`,
      );
    if (q.minPrice !== undefined)
      predicates.push(
        Prisma.sql`p."priceCents">=${Math.round(q.minPrice * 100)}`,
      );
    if (q.maxPrice !== undefined)
      predicates.push(
        Prisma.sql`p."priceCents"<=${Math.round(q.maxPrice * 100)}`,
      );
    if (q.inStock === "true")
      predicates.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "ProductVariant" v JOIN "InventoryItem" i ON i."variantId"=v.id WHERE v."productId"=p.id AND i."onHand"-i.reserved-i."safetyStock">0)`,
      );
    if (q.color)
      predicates.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND lower(v.options->>'color')=lower(${q.color}))`,
      );
    if (q.size)
      predicates.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND lower(v.options->>'size')=lower(${q.size}))`,
      );
    const rating = Prisma.sql`COALESCE((SELECT AVG(r.rating) FROM "Review" r WHERE r."productId"=p.id AND r.status='approved'),0)`;
    if (q.rating !== undefined)
      predicates.push(Prisma.sql`${rating} >= ${q.rating}`);
    const order =
      q.sort === "price-asc"
        ? Prisma.sql`p."priceCents" ASC`
        : q.sort === "price-desc"
          ? Prisma.sql`p."priceCents" DESC`
          : q.sort === "newest"
            ? Prisma.sql`p."createdAt" DESC`
            : q.sort === "rating"
              ? Prisma.sql`${rating} DESC`
              : Prisma.sql`p.featured DESC`;
    const where = Prisma.join(predicates, " AND ");
    const [ids, counts, categories, brands] = await Promise.all([
      db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT p.id FROM "Product" p WHERE ${where} ORDER BY ${order},p.id ASC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      ),
      db.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS count FROM "Product" p WHERE ${where}`,
      ),
      db.category.findMany({ orderBy: { name: "asc" } }),
      db.brand.findMany({ orderBy: { name: "asc" } }),
    ]);
    const products = await db.product.findMany({
      where: { id: { in: ids.map((i) => i.id) } },
      include: productInclude,
    });
    const items = ids.map((i) =>
      productView(products.find((p) => p.id === i.id)!),
    );
    return {
      items,
      total: Number(counts[0]?.count ?? 0),
      page: q.page,
      limit: q.limit,
      facets: { categories, brands },
    };
  }
  @Get("products/:slug") async product(@Param("slug") slug: string) {
    const p = await db.product.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        status: "published",
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
        ],
      },
      include: productInclude,
    });
    if (!p) throw new NotFoundException("Product not found");
    const related = await db.product.findMany({
      where: {
        status: "published",
        id: { not: p.id },
        categories: {
          some: { categoryId: { in: p.categories.map((c) => c.categoryId) } },
        },
      },
      include: productInclude,
      take: 4,
    });
    return {
      ...productView(p),
      related: related.map(productView),
      questions: await db.productQuestion.findMany({
        where: { productId: p.id, status: "approved" },
        include: { answers: true },
      }),
    };
  }
  @Get("categories") async categories() {
    return { items: await db.category.findMany({ orderBy: { name: "asc" } }) };
  }
  @Get("brands") async brands() {
    return { items: await db.brand.findMany({ orderBy: { name: "asc" } }) };
  }
  @Get("collections") async collections() {
    return {
      items: await db.collection.findMany({ orderBy: { name: "asc" } }),
    };
  }
  @Get("search/suggestions") async suggestions(@Query("q") q = "") {
    return {
      items: await db.product.findMany({
        where: {
          status: "published",
          OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
          name: { contains: q.slice(0, 100), mode: "insensitive" },
        },
        select: {
          id: true,
          slug: true,
          name: true,
          imageUrl: true,
          priceCents: true,
        },
        take: 6,
      }),
    };
  }
  @Get("content/:slug") async content(@Param("slug") slug: string) {
    const p = await db.cmsPage.findUnique({ where: { slug } });
    if (!p?.published) throw new NotFoundException("Page not found");
    return p;
  }
  @Get("banners") async banners() {
    return { items: await db.banner.findMany({ where: { active: true } }) };
  }
  @Post("contact") async contact(@Body() raw: unknown) {
    const i = parse(
      z
        .object({
          name: z.string().min(2).max(100),
          email: z.email(),
          message: z.string().min(10).max(5000),
        })
        .strict(),
      raw,
    );
    await emit(db, "email.send", {
      to: process.env.SUPPORT_EMAIL ?? "support@fieldwork.local",
      subject: `Contact from ${i.name}`,
      text: `${i.email}\n${i.message}`,
    });
    return { ok: true };
  }
  @Post("newsletter") async newsletter(@Body() raw: unknown) {
    const { email } = parse(z.object({ email: z.email() }).strict(), raw);
    await db.newsletterSubscription.upsert({
      where: { email },
      create: { email },
      update: { active: true },
    });
    return { ok: true };
  }
  @Post("back-in-stock") async subscribe(@Body() raw: unknown) {
    const input = parse(
      z.object({ email: z.email(), variantId: z.string() }).strict(),
      raw,
    );
    await db.backInStockSubscription.upsert({
      where: { variantId_email: input },
      create: input,
      update: { notifiedAt: null },
    });
    return { ok: true };
  }
  @Post("events") async events(
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
  ) {
    const input = parse(
      z
        .object({
          type: z.enum(["product_view", "add_to_cart", "checkout_started"]),
          productId: z.string().optional(),
        })
        .strict(),
      raw,
    );
    await db.analyticsEvent.create({
      data: {
        ...input,
        sessionId: req.cookies?.cart ?? req.requestId,
        userId: req.actor?.id,
      },
    });
    return { ok: true };
  }
}
