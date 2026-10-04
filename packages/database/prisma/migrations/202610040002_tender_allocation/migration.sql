-- Immutable tender allocation: cash capture and stored-value gift tender remain separate.
ALTER TABLE "Order" ADD COLUMN "cartId" TEXT,
  ADD COLUMN "giftCardCode" TEXT,
  ADD COLUMN "giftCardAppliedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "giftCardCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Refund" ADD COLUMN "cashAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "giftCardAmountCents" INTEGER NOT NULL DEFAULT 0;
-- Previous captures and refunds were cash only.
UPDATE "Refund" SET "cashAmountCents" = "amountCents";
ALTER TABLE "Order" ADD CONSTRAINT "Order_gift_tender_bounds"
  CHECK ("giftCardAppliedCents" >= 0 AND "giftCardAppliedCents" <= "totalCents"
    AND ("giftCardAppliedCents" = 0 OR "giftCardCode" IS NOT NULL));
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_refund_bounds";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_bounds"
  CHECK ("amountCents" >= 0 AND "giftCardCents" >= 0 AND "refundedCents" >= 0
    AND "refundedCents" <= "amountCents" + "giftCardCents");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_tender_allocation_valid"
  CHECK ("cashAmountCents" >= 0 AND "giftCardAmountCents" >= 0
    AND "amountCents" = "cashAmountCents" + "giftCardAmountCents");
