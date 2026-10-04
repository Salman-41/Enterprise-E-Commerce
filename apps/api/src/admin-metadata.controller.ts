import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { prisma as db } from "@commerce/database";
import { z } from "zod";
import { CommerceRequest, Require } from "./security";
import { parse, pageQuery, audit, emit, serial } from "./helpers";
const metadata = z
  .object({
    name: z.string().min(2).max(100),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().max(5000).optional(),
  })
  .strict();
@Controller("admin")
@ApiTags("Admin metadata")
export class AdminMetadataController {
  @Get("categories") @Require("catalog.read") async categories(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.category.findMany({
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { name: "asc" },
      }),
      db.category.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("categories") @Require("catalog.write") async category(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      metadata.extend({ parentId: z.string().nullable().optional() }),
      raw,
    );
    return serial(async (tx) => {
      const result = await tx.category.create({ data: i });
      await audit(tx, r, "category.create", "Category", result.id);
      return result;
    });
  }
  @Patch("categories/:id") @Require("catalog.write") async updateCategory(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(metadata.partial(), raw);
    return serial(async (tx) => {
      const result = await tx.category.update({ where: { id }, data: i });
      await audit(tx, r, "category.update", "Category", id);
      const products = await tx.productCategory.findMany({
        where: { categoryId: id },
        select: { productId: true },
      });
      for (const p of products)
        await emit(tx, "catalog.changed", { productId: p.productId });
      return result;
    });
  }
  @Get("brands") @Require("catalog.read") async brands(@Query() raw: unknown) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.brand.findMany({
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { name: "asc" },
      }),
      db.brand.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("brands") @Require("catalog.write") async brand(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(metadata, raw);
    return serial(async (tx) => {
      const result = await tx.brand.create({ data: i });
      await audit(tx, r, "brand.create", "Brand", result.id);
      return result;
    });
  }
  @Patch("brands/:id") @Require("catalog.write") async updateBrand(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(metadata.partial(), raw);
    return serial(async (tx) => {
      const result = await tx.brand.update({ where: { id }, data: i });
      await audit(tx, r, "brand.update", "Brand", id);
      const products = await tx.product.findMany({
        where: { brandId: id },
        select: { id: true },
      });
      for (const p of products)
        await emit(tx, "catalog.changed", { productId: p.id });
      return result;
    });
  }
  @Get("collections") @Require("catalog.read") async collections(
    @Query() raw: unknown,
  ) {
    const q = parse(pageQuery, raw);
    const [items, total] = await Promise.all([
      db.collection.findMany({
        take: q.limit,
        skip: (q.page - 1) * q.limit,
        orderBy: { name: "asc" },
      }),
      db.collection.count(),
    ]);
    return { items, total, ...q };
  }
  @Post("collections") @Require("catalog.write") async collection(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(metadata.extend({ imageUrl: z.string().optional() }), raw);
    return serial(async (tx) => {
      const result = await tx.collection.create({ data: i });
      await audit(tx, r, "collection.create", "Collection", result.id);
      return result;
    });
  }
  @Patch("collections/:id") @Require("catalog.write") async updateCollection(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      metadata.extend({ imageUrl: z.string().optional() }).partial(),
      raw,
    );
    return serial(async (tx) => {
      const result = await tx.collection.update({ where: { id }, data: i });
      await audit(tx, r, "collection.update", "Collection", id);
      return result;
    });
  }
  @Get("banners") @Require("content.manage") async banners() {
    const items = await db.banner.findMany();
    return { items, total: items.length, page: 1, limit: 100 };
  }
  @Patch("banners/:id") @Require("content.manage") async banner(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          title: z.string().max(200).optional(),
          subtitle: z.string().max(500).optional(),
          imageUrl: z.string().max(1000).optional(),
          linkUrl: z
            .string()
            .regex(/^\/(?!\/)/)
            .optional(),
          active: z.boolean().optional(),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      const result = await tx.banner.update({ where: { id }, data: i });
      await audit(tx, r, "banner.update", "Banner", id);
      return result;
    });
  }
  @Get("navigation") @Require("content.manage") async navigation() {
    const items = await db.navigationMenu.findMany({
      include: { items: { orderBy: { position: "asc" } } },
    });
    return { items, total: items.length, page: 1, limit: 100 };
  }
  @Patch("navigation/:id") @Require("content.manage") async nav(
    @Param("id") id: string,
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          name: z.string().max(100),
          items: z
            .array(
              z.object({
                label: z.string().max(100),
                url: z.string().regex(/^\/(?!\/)/),
                position: z.number().int().min(0),
              }),
            )
            .max(30),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      await tx.navigationItem.deleteMany({ where: { menuId: id } });
      const result = await tx.navigationMenu.update({
        where: { id },
        data: { name: i.name, items: { create: i.items } },
        include: { items: true },
      });
      await audit(tx, r, "navigation.update", "NavigationMenu", id);
      return result;
    });
  }
}
