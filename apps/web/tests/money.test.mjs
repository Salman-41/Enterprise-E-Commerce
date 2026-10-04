import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
test("every seeded category has a bundled nonempty product asset", () => {
  for (const category of [
    "outerwear",
    "knitwear",
    "shirts",
    "trousers",
    "dresses",
    "footwear",
    "bags",
    "accessories",
    "home",
    "lighting",
    "audio",
    "wellness",
  ]) {
    const source = readFileSync(
      `public/images/products/${category}.svg`,
      "utf8",
    );
    assert.ok(source.includes("<svg"));
    assert.ok(source.length > 400);
  }
});
test("customer journey routes and error recovery are present", () => {
  for (const route of [
    "shop",
    "search",
    "cart",
    "checkout",
    "account",
    "track",
    "contact",
    "returns",
    "shipping",
  ])
    assert.ok(existsSync(`app/${route}/page.tsx`));
  assert.ok(existsSync("app/error.tsx"));
  assert.ok(readFileSync("app/layout.tsx", "utf8").includes("Skip to content"));
});
