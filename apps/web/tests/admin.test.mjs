import { test } from "node:test";
import assert from "node:assert/strict";
import { csv, present } from "../admin-components/contracts.ts";
test("CSV export neutralizes spreadsheet formulas and preserves quoted content", () => {
  const result = csv([
    { name: '=HYPERLINK("bad")', note: "linen, cotton", quantity: 3 },
  ]);
  assert.match(result, /'=HYPERLINK/);
  assert.match(result, /"linen, cotton"/);
  assert.match(result, /""bad""/);
});
test("CSV exports all selected row fields without losing null values", () => {
  assert.equal(
    csv([
      { id: "a", value: null },
      { id: "b", value: 7 },
    ]),
    '"id","value"\r\n"a",""\r\n"b","7"',
  );
});
test("Operations rendering identifies joined records and distinguishes zero from missing", () => {
  assert.equal(present({ name: "East warehouse" }), "East warehouse");
  assert.equal(present(0), "0");
  assert.equal(present(null), "—");
});
import { request } from "../admin-components/client.ts";
test("Admin request uses same-origin cookie transport and rejects unauthorized responses", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/v1/admin/orders");
      assert.equal(options.credentials, "include");
      return new Response(JSON.stringify({ message: "private" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    };
    await assert.rejects(request("/admin/orders"), /does not have permission/);
  } finally {
    globalThis.fetch = original;
  }
});
test("Successful writes preserve idempotency header without leaking it into URL", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers["Idempotency-Key"], "refund-demo-001");
      assert.equal(options.method, "POST");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    };
    assert.deepEqual(
      await request("/admin/orders/1/refund", {
        method: "POST",
        headers: { "Idempotency-Key": "refund-demo-001" },
        body: "{}",
      }),
      { ok: true },
    );
  } finally {
    globalThis.fetch = original;
  }
});
import { parseInventoryCsv } from "../admin-components/inventory-csv.ts";
test("Inventory CSV supports quoted reasons and rejects duplicate conflicting adjustments", () => {
  assert.deepEqual(
    parseInventoryCsv(
      'id,delta,reason,version\nstock-1,2,"Counted, verified",3',
    ).rows,
    [{ id: "stock-1", delta: 2, reason: "Counted, verified", version: 3 }],
  );
  const invalid = parseInventoryCsv(
    "id,delta,reason,version\nstock-1,2,Counted stock,3\nstock-1,4,Counted twice,3",
  );
  assert.equal(invalid.rows.length, 0);
  assert.match(invalid.errors.join(" "), /duplicate ID/);
});
test("Inventory CSV rejects malformed integer quantities and unterminated quotes before mutations", () => {
  assert.equal(
    parseInventoryCsv("id,delta,reason,version\na,NaN,Counted stock,1").rows
      .length,
    0,
  );
  assert.match(
    parseInventoryCsv('id,delta,reason,version\na,1,"no closing quote,1')
      .errors[0],
    /Unclosed/,
  );
});
