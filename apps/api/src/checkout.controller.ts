import {
  Body,
  Controller,
  Post,
  Req,
  Headers,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiHeader } from "@nestjs/swagger";
import { z } from "zod";
import { CheckoutService } from "./checkout.service";
import { CommerceRequest } from "./security";
import { parse } from "./helpers";
export const addressSchema = z
  .object({
    name: z.string().min(2).max(100),
    line1: z.string().min(3).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(2).max(100),
    region: z.string().max(100).default(""),
    postalCode: z.string().min(2).max(20),
    country: z.string().length(2).default("US"),
    phone: z.string().max(30).optional(),
  })
  .strict();
export const checkoutSchema = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    address: addressSchema,
    shippingMethod: z.enum(["standard", "express"]).default("standard"),
    paymentMethod: z
      .enum(["mock_success", "mock_fail"])
      .default("mock_success"),
  })
  .strict();
@Controller()
@ApiTags("Checkout")
export class CheckoutController {
  constructor(private checkoutService: CheckoutService) {}
  @Post("checkout")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  async checkout(
    @Req() req: CommerceRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    if (!key) throw new BadRequestException("Idempotency-Key is required");
    return this.checkoutService.checkout(req, parse(checkoutSchema, body), key);
  }
  @Post("orders/:id/pay")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  async pay(
    @Req() req: CommerceRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
    @Headers("idempotency-key") key?: string,
    @Query("token") token?: string,
  ) {
    if (!key) throw new BadRequestException("Idempotency-Key is required");
    const input = parse(
      z
        .object({ paymentMethod: z.enum(["mock_success", "mock_fail"]) })
        .strict(),
      raw,
    );
    return this.checkoutService.retry(req, id, input.paymentMethod, key, token);
  }
}
