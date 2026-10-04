import { describe, it, expect } from "vitest";
import { assertTransition, calculateTotals, refundAmount } from "../src/domain";
describe("commerce money and state invariants", () => {
  it("uses integer cents and applies tax to discounted merchandise", () =>
    expect(calculateTotals(10000, 1000)).toMatchObject({
      subtotal: 10000,
      discount: 1000,
      tax: 450,
      shipping: 700,
      total: 10150,
    }));
  it("clamps discounts and free shipping thresholds", () => {
    expect(calculateTotals(16000, 0).shipping).toBe(0);
    expect(calculateTotals(1000, 2000).total).toBe(700);
  });
  it("rejects floating monetary inputs", () =>
    expect(() => calculateTotals(10.2, 0)).toThrow());
  it("allows payment recovery and denies impossible transitions", () => {
    assertTransition("payment_failed", "paid");
    expect(() => assertTransition("cancelled", "paid")).toThrow();
  });
  it("cannot refund more than captured or zero", () => {
    expect(refundAmount(1000, 200, 300)).toBe(500);
    expect(() => refundAmount(1000, 900, 200)).toThrow();
    expect(() => refundAmount(1000, 0, 0)).toThrow();
  });
});
