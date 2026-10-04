import {
  Body,
  Controller,
  Post,
  Req,
  Headers,
  UnauthorizedException,
  ServiceUnavailableException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { ApiTags, ApiHeader } from "@nestjs/swagger";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parse, serial, orderInclude } from "./helpers";
import { CommerceRequest } from "./security";
import { CheckoutService } from "./checkout.service";
@Controller("payments")
@ApiTags("Payments")
export class PaymentsController {
  constructor(private checkout: CheckoutService) {}
  @Post("webhook")
  @ApiHeader({ name: "x-webhook-signature", required: true })
  async webhook(
    @Req() req: CommerceRequest & { rawBody?: Buffer },
    @Body() raw: unknown,
    @Headers("x-webhook-signature") signature?: string,
  ) {
    const secret = process.env.MOCK_WEBHOOK_SECRET;
    if (!secret)
      throw new ServiceUnavailableException("Webhook secret is not configured");
    const expected = createHmac("sha256", secret)
      .update(req.rawBody ?? Buffer.from(JSON.stringify(raw)))
      .digest("hex");
    if (
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new UnauthorizedException("Invalid webhook signature");
    const i = parse(
      z
        .object({
          eventId: z.string().min(8).max(200),
          orderId: z.string(),
          status: z.enum(["succeeded", "failed"]),
        })
        .strict(),
      raw,
    );
    return serial(async (tx) => {
      const prior = await tx.webhookEvent.findUnique({
        where: { provider_eventId: { provider: "mock", eventId: i.eventId } },
      });
      if (prior) {
        const payload = parse(
          z.object({
            eventId: z.string(),
            orderId: z.string(),
            status: z.string(),
          }),
          prior.payload,
        );
        if (
          payload.eventId !== i.eventId ||
          payload.orderId !== i.orderId ||
          payload.status !== i.status
        )
          throw new ConflictException(
            "Webhook event ID was already used for another payload",
          );
        return { ok: true, duplicate: true };
      }
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${i.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: i.orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      const ev = await tx.webhookEvent.create({
        data: { provider: "mock", eventId: i.eventId, payload: i },
      });
      if (
        order.paymentStatus !== "succeeded" &&
        ["pending_payment", "payment_failed"].includes(order.status)
      ) {
        if (order.status === "payment_failed") {
          await this.checkout.reserve(
            tx,
            order.id,
            order.items.map((x) => ({
              variantId: x.variantId!,
              quantity: x.quantity,
            })),
          );
          await tx.order.update({
            where: { id: order.id },
            data: { status: "pending_payment" },
          });
        }
        await this.checkout.finishPayment(
          tx,
          order.id,
          i.status === "succeeded" ? "mock_success" : "mock_fail",
        );
      }
      await tx.webhookEvent.update({
        where: { id: ev.id },
        data: { status: "processed", processedAt: new Date() },
      });
      return {
        ok: true,
        duplicate: false,
        order: await tx.order.findUnique({
          where: { id: order.id },
          include: orderInclude,
        }),
      };
    });
  }
}
