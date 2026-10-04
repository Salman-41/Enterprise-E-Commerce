import { BadRequestException } from "@nestjs/common";
export const money = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new BadRequestException(
      "Amounts must be non-negative integer minor units",
    );
  return value;
};
export function calculateTotals(
  subtotal: number,
  discount: number,
  shippingMethod = "standard",
  freeShipping = false,
) {
  money(subtotal);
  money(discount);
  const appliedDiscount = Math.min(subtotal, discount);
  const shipping =
    freeShipping || subtotal - appliedDiscount >= 15000
      ? 0
      : shippingMethod === "express"
        ? 1500
        : 700;
  const tax = Math.round((subtotal - appliedDiscount) * 0.05);
  return {
    subtotal,
    discount: appliedDiscount,
    shipping,
    tax,
    total: subtotal - appliedDiscount + shipping + tax,
    currency: "USD",
  };
}
export const transitions: Record<string, readonly string[]> = {
  pending_payment: ["paid", "payment_failed", "cancelled"],
  payment_failed: ["pending_payment", "paid", "cancelled"],
  paid: [
    "processing",
    "partially_fulfilled",
    "fulfilled",
    "partially_refunded",
    "refunded",
    "cancelled",
    "return_requested",
  ],
  processing: [
    "partially_fulfilled",
    "fulfilled",
    "partially_refunded",
    "refunded",
    "cancelled",
    "return_requested",
  ],
  partially_fulfilled: [
    "fulfilled",
    "partially_refunded",
    "refunded",
    "return_requested",
  ],
  fulfilled: [
    "completed",
    "partially_refunded",
    "refunded",
    "return_requested",
  ],
  completed: ["partially_refunded", "refunded", "return_requested"],
  partially_refunded: [
    "refunded",
    "partially_fulfilled",
    "fulfilled",
    "return_requested",
  ],
  return_requested: ["returned", "partially_refunded", "refunded"],
  returned: ["partially_refunded", "refunded"],
  cancelled: [],
  refunded: [],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    throw new BadRequestException(`Invalid order transition: ${from} → ${to}`);
}
export function refundAmount(total: number, refunded: number, amount: number) {
  money(amount);
  if (!amount || refunded + amount > total)
    throw new BadRequestException("Refund exceeds remaining captured payment");
  return refunded + amount;
}
