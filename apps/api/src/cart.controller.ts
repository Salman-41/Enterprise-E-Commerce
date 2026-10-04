import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  Res,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { prisma as db } from "@commerce/database";
import type { Response } from "express";
import { z } from "zod";
import { CartService, cartInclude } from "./cart.service";
import { CommerceRequest } from "./security";
import { parse } from "./helpers";
@Controller("cart")
@ApiTags("Cart")
export class CartController {
  constructor(private carts: CartService) {}
  @Get() async get(
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.carts.view(await this.carts.get(req, res));
  }
  @Post("items") async add(
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z
        .object({
          variantId: z.string(),
          quantity: z.number().int().min(1).max(99),
        })
        .strict(),
      raw,
    );
    const cart = await this.carts.get(req, res);
    await this.carts.add(cart.id, input.variantId, input.quantity);
    return this.carts.view(
      (await db.cart.findUnique({
        where: { id: cart.id },
        include: cartInclude,
      }))!,
    );
  }
  @Patch("items/:id") async update(
    @Param("id") id: string,
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z
        .object({
          quantity: z.number().int().min(1).max(99).optional(),
          savedForLater: z.boolean().optional(),
        })
        .strict(),
      raw,
    );
    const cart = await this.carts.get(req, res);
    const item = cart.items.find((i) => i.id === id);
    if (!item) throw new BadRequestException("Cart item not found");
    if (
      input.quantity &&
      input.quantity >
        item.variant.inventory.reduce(
          (a, i) => a + Math.max(0, i.onHand - i.reserved - i.safetyStock),
          0,
        )
    )
      throw new BadRequestException("Insufficient stock");
    await db.cartItem.update({ where: { id }, data: input });
    return this.carts.view(
      (await db.cart.findUnique({
        where: { id: cart.id },
        include: cartInclude,
      }))!,
    );
  }
  @Delete("items/:id") async remove(
    @Param("id") id: string,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.carts.get(req, res);
    await db.cartItem.deleteMany({ where: { id, cartId: cart.id } });
    return this.carts.view(
      (await db.cart.findUnique({
        where: { id: cart.id },
        include: cartInclude,
      }))!,
    );
  }
  @Post("coupon") async coupon(
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { code } = parse(
      z.object({ code: z.string().max(64) }).strict(),
      raw,
    );
    const cart = await this.carts.get(req, res);
    const next = { ...cart, couponCode: code.toUpperCase() || null };
    await this.carts.view(next);
    await db.cart.update({
      where: { id: cart.id },
      data: { couponCode: next.couponCode },
    });
    return this.carts.view(next);
  }
  @Post("gift-card") async gift(
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { code } = parse(
      z.object({ code: z.string().max(64) }).strict(),
      raw,
    );
    const cart = await this.carts.get(req, res);
    if (code) {
      const gift = await db.giftCard.findUnique({
        where: { code: code.toUpperCase() },
      });
      if (
        !gift?.active ||
        gift.balanceCents <= 0 ||
        (gift.expiresAt && gift.expiresAt < new Date())
      )
        throw new BadRequestException("Gift card is invalid or exhausted");
    }
    const next = await db.cart.update({
      where: { id: cart.id },
      data: { giftCardCode: code.toUpperCase() || null },
      include: cartInclude,
    });
    return this.carts.view(next);
  }
}
