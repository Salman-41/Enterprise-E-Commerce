/** Real HTTP + PostgreSQL integration checks. Run ONLY on a disposable migrated test DB.
 * Start compiled API with same DATABASE_URL first; then pnpm exec tsx scripts/qa-api.ts.
 * Fixtures are intentionally retained for inspection, with QA_RUN_ID namespaces.
 */
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { prisma as db } from "../packages/database/src/index";
const base = process.env.QA_API_URL ?? "http://localhost:4000/api/v1";
const run = process.env.QA_RUN_ID ?? randomUUID().slice(0, 8);
if (process.env.QA_ALLOW_MUTATION !== "true")
  throw new Error("Set QA_ALLOW_MUTATION=true only for a disposable database.");
let passed = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  passed++;
  console.log(`PASS ${message}`);
}
class Client {
  cookies = new Map<string, string>();
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    extraHeaders: Record<string, string> = {},
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(key ? { "Idempotency-Key": key } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const data = await response.json();
    return { status: response.status, data };
  }
}
const address = {
  name: "QA Test Customer",
  line1: "100 QA Street",
  city: "Portland",
  region: "OR",
  postalCode: "97201",
  country: "US",
};
const input = (paymentMethod = "mock_success") => ({
  email: `qa-${run}@example.com`,
  address,
  shippingMethod: "standard",
  paymentMethod,
});
const key = (name: string) => `qa-${run}-${name}`;
async function fixture(label: string, stock = 10) {
  const brand = await db.brand.findFirstOrThrow();
  const warehouse = await db.warehouse.findFirstOrThrow();
  const p = await db.product.create({
    data: {
      name: `QA ${run} ${label}`,
      slug: `qa-${run}-${label}`,
      description: "Isolated API test fixture",
      brandId: brand.id,
      priceCents: 2000,
      imageUrl: "/images/products/home.svg",
      variants: {
        create: {
          name: "Default",
          sku: `QA-${run}-${label}`,
          priceCents: 2000,
          inventory: {
            create: {
              warehouseId: warehouse.id,
              onHand: stock,
              safetyStock: 0,
            },
          },
        },
      },
    },
    include: { variants: { include: { inventory: true } } },
  });
  return p.variants[0];
}
async function add(client: Client, variantId: string) {
  const r = await client.request("/cart/items", "POST", {
    variantId,
    quantity: 1,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
}
async function main() {
  const guest = new Client();
  const standard = await fixture("standard");
  await add(guest, standard.id);
  const paid = await guest.request(
    "/checkout",
    "POST",
    input(),
    key("checkout"),
  );
  check(
    paid.status === 201 && paid.data.status === "paid",
    "guest checkout captures payment",
  );
  const replay = await guest.request(
    "/checkout",
    "POST",
    input(),
    key("checkout"),
  );
  check(
    replay.status === 201 && replay.data.id === paid.data.id,
    "duplicate checkout returns original order",
  );
  check(
    (await db.order.count({ where: { id: paid.data.id } })) === 1,
    "checkout replay creates one order",
  );
  const item = await db.inventoryItem.findUniqueOrThrow({
    where: { id: standard.inventory[0].id },
  });
  check(
    item.onHand === 9 && item.reserved === 0,
    "successful purchase commits and releases reservation",
  );
  const modified = await guest.request(
    "/checkout",
    "POST",
    { ...input(), shippingMethod: "express" },
    key("checkout"),
  );
  check(modified.status === 409, "idempotency key input mismatch rejected");
  const stranger = new Client();
  const stolen = await stranger.request(`/orders/${paid.data.id}`);
  check(stolen.status === 404, "guest order requires tracking token");
  const tracked = await guest.request(
    `/orders/${paid.data.id}?token=${paid.data.trackingToken}`,
  );
  check(tracked.status === 200, "legitimate guest tracking token works");
  const anonAdmin = await stranger.request("/admin/products");
  check(anonAdmin.status === 401, "anonymous admin read rejected");
  const giftClient = new Client();
  const giftVariant = await fixture("gift");
  await add(giftClient, giftVariant.id);
  const giftCode = `QA-GIFT-${run}`.toUpperCase();
  const gift = await db.giftCard.create({
    data: { code: giftCode, initialCents: 1000, balanceCents: 1000 },
  });
  await giftClient.request("/cart/gift-card", "POST", { code: giftCode });
  const giftFailure = await giftClient.request(
    "/checkout",
    "POST",
    input("mock_fail"),
    key("gift-decline"),
  );
  check(
    giftFailure.status === 201 && giftFailure.data.status === "payment_failed",
    "gift payment can decline safely",
  );
  const unchangedGift = await db.giftCard.findUniqueOrThrow({
    where: { id: gift.id },
  });
  check(
    unchangedGift.balanceCents === 1000,
    "decline leaves gift balance untouched",
  );
  const giftRetry = await giftClient.request(
    `/orders/${giftFailure.data.id}/pay?token=${giftFailure.data.trackingToken}`,
    "POST",
    { paymentMethod: "mock_success" },
    key("gift-retry"),
  );
  check(
    giftRetry.status === 201 && giftRetry.data.status === "paid",
    "gift-backed declined payment can retry",
  );
  const consumedGift = await db.giftCard.findUniqueOrThrow({
    where: { id: gift.id },
  });
  check(
    consumedGift.balanceCents === 0,
    "retry consumes gift balance exactly once",
  );
  check(
    giftRetry.data.payments[0].amountCents === giftRetry.data.totalCents - 1000,
    "gift-funded amount is excluded from payment charge",
  );
  const failVariant = await fixture("decline");
  await add(guest, failVariant.id);
  const failed = await guest.request(
    "/checkout",
    "POST",
    input("mock_fail"),
    key("decline"),
  );
  check(
    failed.status === 201 && failed.data.status === "payment_failed",
    "declined payment records failure",
  );
  const released = await db.inventoryItem.findUniqueOrThrow({
    where: { id: failVariant.inventory[0].id },
  });
  check(
    released.onHand === 10 && released.reserved === 0,
    "decline releases stock without decrement",
  );
  const retry = await guest.request(
    `/orders/${failed.data.id}/pay?token=${failed.data.trackingToken}`,
    "POST",
    { paymentMethod: "mock_success" },
    key("retry"),
  );
  check(
    retry.status === 201 && retry.data.status === "paid",
    "declined payment can be retried",
  );
  const unauthorizedReplay = await stranger.request(
    `/orders/${failed.data.id}/pay`,
    "POST",
    { paymentMethod: "mock_success" },
    key("retry"),
  );
  check(
    unauthorizedReplay.status === 404,
    "idempotency replay cannot bypass order ownership",
  );
  // A declined coupon order does not reserve discount capacity forever; retry rechecks the limit.
  const couponCode = `QA-COUPON-${run}`.toUpperCase();
  const promotion = await db.promotion.create({
    data: {
      name: `QA ${run} limited`,
      kind: "percent",
      value: 10,
      startsAt: new Date(Date.now() - 60000),
      usageLimit: 1,
      perCustomerLimit: 1,
      coupons: { create: { code: couponCode } },
    },
    include: { coupons: true },
  });
  const couponVariant = await fixture("coupon");
  const couponA = new Client(),
    couponB = new Client();
  await add(couponA, couponVariant.id);
  await add(couponB, couponVariant.id);
  const appliedA = await couponA.request("/cart/coupon", "POST", {
    code: couponCode,
  });
  check(
    appliedA.status === 201 && appliedA.data.discountCents === 200,
    "limited coupon calculates eligible discount",
  );
  const couponFail = await couponA.request(
    "/checkout",
    "POST",
    input("mock_fail"),
    key("coupon-decline"),
  );
  check(couponFail.status === 201, "coupon order may decline");
  check(
    (
      await db.coupon.findUniqueOrThrow({
        where: { id: promotion.coupons[0].id },
      })
    ).usageCount === 0,
    "declined coupon order does not consume redemption",
  );
  await couponB.request("/cart/coupon", "POST", { code: couponCode });
  const couponSuccess = await couponB.request(
    "/checkout",
    "POST",
    { ...input(), email: `qa-coupon-other-${run}@example.com` },
    key("coupon-success"),
  );
  check(
    couponSuccess.status === 201 && couponSuccess.data.status === "paid",
    "available last coupon redemption captures payment",
  );
  const exhaustedRetry = await couponA.request(
    `/orders/${couponFail.data.id}/pay?token=${couponFail.data.trackingToken}`,
    "POST",
    { paymentMethod: "mock_success" },
    key("coupon-retry"),
  );
  check(
    exhaustedRetry.status === 400,
    "retry rejects coupon exhausted by another purchase",
  );
  check(
    (
      await db.coupon.findUniqueOrThrow({
        where: { id: promotion.coupons[0].id },
      })
    ).usageCount === 1,
    "coupon usage never exceeds configured limit",
  );
  check(
    (await db.couponRedemption.count({
      where: { couponId: promotion.coupons[0].id },
    })) === 1,
    "one successful limited coupon redemption persisted",
  );
  const couponStock = await db.inventoryItem.findUniqueOrThrow({
    where: { id: couponVariant.inventory[0].id },
  });
  check(
    couponStock.onHand === 9 && couponStock.reserved === 0,
    "rejected exhausted retry rolls back stock reservation",
  );
  const customer = new Client();
  const registered = await customer.request("/auth/register", "POST", {
    name: "QA Customer",
    email: `qa-account-${run}@example.com`,
    password: "QApassword!2026",
  });
  check(
    registered.status === 201,
    "registration establishes signed-in session",
  );
  const customerAdmin = await customer.request("/admin/products");
  check(customerAdmin.status === 403, "customer admin read rejected");
  await add(customer, standard.id);
  const signed = await customer.request(
    "/checkout",
    "POST",
    input(),
    key("signed"),
  );
  check(
    signed.status === 201 && signed.data.userId === registered.data.user.id,
    "signed-in checkout attaches owner",
  );
  const account = await customer.request(`/account/orders/${signed.data.id}`);
  check(account.status === 200, "owner can read account order");
  const otherAccount = new Client();
  await otherAccount.request("/auth/register", "POST", {
    name: "QA Stranger",
    email: `qa-other-${run}@example.com`,
    password: "QApassword!2026",
  });
  const blocked = await otherAccount.request(
    `/account/orders/${signed.data.id}`,
  );
  check(blocked.status === 404, "another customer cannot read account order");
  const malformed = await stranger.request(
    "/checkout",
    "POST",
    { ...input(), userId: registered.data.user.id },
    key("invalid"),
  );
  check(malformed.status === 400, "unsafe unknown checkout fields rejected");
  // Both carts see the final unit before either checkout. Database must arbitrate checkout.
  const last = await fixture("last", 1);
  const a = new Client(),
    b = new Client();
  await add(a, last.id);
  await add(b, last.id);
  const race = await Promise.all([
    a.request("/checkout", "POST", input(), key("race-a")),
    b.request("/checkout", "POST", input(), key("race-b")),
  ]);
  check(
    race.filter((r) => r.status === 201 && r.data.status === "paid").length ===
      1,
    "last-unit concurrent checkouts have exactly one winner",
  );
  check(
    race.some((r) => r.status === 409 || r.status === 400),
    "losing last-unit checkout fails safely",
  );
  const final = await db.inventoryItem.findUniqueOrThrow({
    where: { id: last.inventory[0].id },
  });
  check(
    final.onHand === 0 && final.reserved === 0,
    "last-unit concurrency preserves nonnegative stock",
  );
  // Signed raw-JSON mock webhooks must authenticate before touching database state.
  const webhookSecret = process.env.MOCK_WEBHOOK_SECRET;
  if (!webhookSecret)
    throw new Error(
      "MOCK_WEBHOOK_SECRET must match the running API for webhook QA.",
    );
  const webhookClient = new Client();
  const webhookVariant = await fixture("webhook");
  await add(webhookClient, webhookVariant.id);
  const webhookOrder = await webhookClient.request(
    "/checkout",
    "POST",
    input("mock_fail"),
    key("webhook-decline"),
  );
  assert.equal(webhookOrder.status, 201);
  const webhookBody = {
    eventId: key("webhook-event"),
    orderId: webhookOrder.data.id,
    status: "succeeded",
  };
  const sign = (body: unknown) =>
    createHmac("sha256", webhookSecret)
      .update(JSON.stringify(body))
      .digest("hex");
  const badHook = await stranger.request(
    "/payments/webhook",
    "POST",
    webhookBody,
    undefined,
    { "x-webhook-signature": "0".repeat(64) },
  );
  check(badHook.status === 401, "invalid webhook signature rejected");
  check(
    (await db.webhookEvent.count({
      where: { eventId: webhookBody.eventId },
    })) === 0,
    "invalid webhook creates no event",
  );
  const goodHook = await stranger.request(
    "/payments/webhook",
    "POST",
    webhookBody,
    undefined,
    { "x-webhook-signature": sign(webhookBody) },
  );
  check(
    goodHook.status === 201 && goodHook.data.order.status === "paid",
    "signed webhook captures declined order",
  );
  const duplicateHook = await stranger.request(
    "/payments/webhook",
    "POST",
    webhookBody,
    undefined,
    { "x-webhook-signature": sign(webhookBody) },
  );
  check(
    duplicateHook.status === 201 && duplicateHook.data.duplicate === true,
    "duplicate signed webhook is acknowledged safely",
  );
  check(
    (await db.webhookEvent.count({
      where: { eventId: webhookBody.eventId },
    })) === 1,
    "duplicate webhook produces one event row",
  );
  const hookStock = await db.inventoryItem.findUniqueOrThrow({
    where: { id: webhookVariant.inventory[0].id },
  });
  check(
    hookStock.onHand === 9 && hookStock.reserved === 0,
    "duplicate webhook commits inventory once",
  );
  const changedHook = { ...webhookBody, status: "failed" };
  const conflictingHook = await stranger.request(
    "/payments/webhook",
    "POST",
    changedHook,
    undefined,
    { "x-webhook-signature": sign(changedHook) },
  );
  check(
    conflictingHook.status === 409,
    "same webhook event ID cannot describe different payload",
  );
  const admin = new Client();
  const login = await admin.request("/auth/login", "POST", {
    email: "admin@example.com",
    password: "DemoAdmin!2026",
  });
  check(login.status === 201, "seeded administrator login works");
  const fulfillment = await admin.request(
    `/admin/orders/${signed.data.id}/fulfill`,
    "POST",
    { carrier: "QA carrier", trackingNumber: `QA-${run}` },
  );
  check(fulfillment.status === 201, "paid order can be fulfilled");
  const repeatedFulfillment = await admin.request(
    `/admin/orders/${signed.data.id}/fulfill`,
    "POST",
    { carrier: "QA carrier", trackingNumber: `QA-${run}-again` },
  );
  check(
    repeatedFulfillment.status === 400,
    "fully fulfilled order cannot fulfill twice",
  );
  const duplicateReturn = await customer.request(
    `/account/orders/${signed.data.id}/return`,
    "POST",
    {
      reason: "QA wrong size",
      items: [
        { orderItemId: signed.data.items[0].id, quantity: 1 },
        { orderItemId: signed.data.items[0].id, quantity: 1 },
      ],
    },
  );
  check(
    duplicateReturn.status === 400,
    "duplicate return lines cannot exceed purchased quantity",
  );
  const refund = await admin.request(
    `/admin/orders/${paid.data.id}/refund`,
    "POST",
    { amount: 100, reason: "QA partial refund" },
    key("refund"),
  );
  check(refund.status === 201, "administrator can issue partial refund");
  const repeated = await admin.request(
    `/admin/orders/${paid.data.id}/refund`,
    "POST",
    { amount: 100, reason: "QA partial refund" },
    key("refund"),
  );
  check(repeated.status === 201, "refund idempotency replay succeeds");
  // Splitting a mixed gift/cash refund must restore exact original tender even with rounding.
  const giftPaid = giftRetry.data;
  const half = Math.floor(giftPaid.totalCents / 2);
  const giftRefund1 = await admin.request(
    `/admin/orders/${giftPaid.id}/refund`,
    "POST",
    { amount: half, reason: "QA split gift refund" },
    key("gift-refund-first"),
  );
  check(giftRefund1.status === 201, "mixed tender partial refund succeeds");
  const giftBalance1 = await db.giftCard.findUniqueOrThrow({
    where: { id: gift.id },
  });
  check(
    giftBalance1.balanceCents ===
      Math.floor((half * 1000) / giftPaid.totalCents),
    "partial refund restores proportional gift tender",
  );
  const giftReplay = await admin.request(
    `/admin/orders/${giftPaid.id}/refund`,
    "POST",
    { amount: half, reason: "QA split gift refund" },
    key("gift-refund-first"),
  );
  check(giftReplay.status === 201, "gift refund replay succeeds");
  check(
    (await db.giftCard.findUniqueOrThrow({ where: { id: gift.id } }))
      .balanceCents === giftBalance1.balanceCents,
    "gift refund replay does not restore credit twice",
  );
  const giftRefund2 = await admin.request(
    `/admin/orders/${giftPaid.id}/refund`,
    "POST",
    { amount: giftPaid.totalCents - half, reason: "QA final gift refund" },
    key("gift-refund-final"),
  );
  check(
    giftRefund2.status === 201 && giftRefund2.data.status === "refunded",
    "split refunds reach fully refunded state",
  );
  const restoredGift = await db.giftCard.findUniqueOrThrow({
    where: { id: gift.id },
  });
  check(
    restoredGift.balanceCents === 1000,
    "full split refund restores exact original gift balance",
  );
  const allGiftRefunds = await db.refund.findMany({
    where: { payment: { orderId: giftPaid.id } },
  });
  check(
    allGiftRefunds.reduce((sum, r) => sum + r.giftCardAmountCents, 0) === 1000,
    "split refund gift allocations sum to original tender",
  );
  check(
    allGiftRefunds.reduce((sum, r) => sum + r.cashAmountCents, 0) ===
      giftPaid.totalCents - 1000,
    "split refund cash allocations sum to captured payment",
  );
  const excessive = await admin.request(
    `/admin/orders/${giftPaid.id}/refund`,
    "POST",
    { amount: 1, reason: "QA excessive refund" },
    key("gift-refund-excess"),
  );
  check(excessive.status === 400, "fully refunded order cannot refund further");
  const refundCount = await db.refund.count({
    where: { payment: { orderId: paid.data.id } },
  });
  check(refundCount === 1, "refund replay creates exactly one refund");
  // Retain audit fixtures while hiding them from the public storefront.
  await db.product.updateMany({
    where: { slug: { startsWith: `qa-${run}-` } },
    data: { status: "archived" },
  });
  console.log(
    JSON.stringify({
      run,
      passed,
      environment: "real HTTP with supplied DATABASE_URL",
      fixturesRetained: true,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
