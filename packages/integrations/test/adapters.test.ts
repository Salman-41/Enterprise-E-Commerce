import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  uploadKey,
  validFileSignature,
  verifyStripeSignature,
  StripeTestProvider,
} from "../src/index.js";
describe("storage validation", () => {
  it("rejects paths, executable types, oversize and zero size", () => {
    expect(() => uploadKey("image/png", 20, "../admin")).toThrow();
    expect(() => uploadKey("text/html", 20, "admin")).toThrow();
    expect(() => uploadKey("image/png", 11 * 1024 * 1024, "admin")).toThrow();
    expect(() => uploadKey("image/png", 0, "admin")).toThrow();
  });
  it("creates opaque per-owner keys", () => {
    const a = uploadKey("image/png", 200, "admin");
    expect(a).toMatch(/^uploads\/admin\/[a-f0-9-]+\.png$/);
    expect(a).not.toBe(uploadKey("image/png", 200, "admin"));
  });
});
describe("file signatures", () => {
  it("rejects HTML disguised as an image", () => {
    expect(validFileSignature(Buffer.from("<html>"), "image/png")).toBe(false);
    expect(
      validFileSignature(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).toBe(true);
    expect(validFileSignature(Buffer.from("%PDF-1.7"), "application/pdf")).toBe(
      true,
    );
  });
});
describe("Stripe webhook authentication", () => {
  it("accepts only unchanged body and fresh signature", () => {
    const body = Buffer.from(
      '{"id":"evt_1","type":"payment_intent.succeeded"}',
    );
    const digest = createHmac("sha256", "whsec_test")
      .update("1000.")
      .update(body)
      .digest("hex");
    expect(
      verifyStripeSignature(body, `t=1000,v1=${digest}`, "whsec_test", 1000).id,
    ).toBe("evt_1");
    expect(() =>
      verifyStripeSignature(
        Buffer.from("{}"),
        `t=1000,v1=${digest}`,
        "whsec_test",
        1000,
      ),
    ).toThrow();
    expect(() =>
      verifyStripeSignature(body, `t=1000,v1=${digest}`, "whsec_test", 1301),
    ).toThrow();
  });
  it("refuses live mode credentials", () =>
    expect(() => new StripeTestProvider("sk_live_disabled")).toThrow());
});
