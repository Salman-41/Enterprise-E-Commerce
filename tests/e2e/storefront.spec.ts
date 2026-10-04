import { test, expect } from "@playwright/test";
test("guest discovers a product, checks out and tracks the confirmed order", async ({
  page,
}) => {
  await page.goto("/shop");
  await expect(
    page.getByRole("heading", { name: "The complete edit." }),
  ).toBeVisible();
  await page.locator(".product-picture").nth(1).click();
  await expect(page.getByRole("button", { name: "Add to bag" })).toBeVisible();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added to your bag." }),
  ).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("guest-browser@example.com");
  await page.getByLabel("Full name", { exact: true }).fill("Browser Guest");
  await page
    .getByLabel("Street address", { exact: true })
    .fill("12 Demo Street");
  await page.getByLabel("City", { exact: true }).fill("Brooklyn");
  await page.getByLabel("State / region").fill("NY");
  await page.getByLabel("Postal code", { exact: true }).fill("11201");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Place demo order" }).click();
  await expect(
    page.getByRole("heading", { name: "Good things are on their way." }),
  ).toBeVisible();
  await expect(page.locator(".timeline")).not.toBeEmpty();
  await page.getByRole("link", { name: "Track this order" }).click();
  await expect(
    page.getByRole("heading", { name: "Good things are on their way." }),
  ).toBeVisible();
});
test("failed mock payment can be retried without a second order", async ({
  page,
}) => {
  await page.goto("/shop");
  await page.locator(".product-picture").nth(1).click();
  await page.getByRole("button", { name: "Buy now" }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("retry-browser@example.com");
  await page.getByLabel("Full name", { exact: true }).fill("Retry Guest");
  await page
    .getByLabel("Street address", { exact: true })
    .fill("9 Example Street");
  await page.getByLabel("City", { exact: true }).fill("Brooklyn");
  await page.getByLabel("State / region").fill("NY");
  await page.getByLabel("Postal code", { exact: true }).fill("11201");
  await page.getByLabel("Demo payment outcome").selectOption("mock_fail");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Place demo order" }).click();
  await expect(
    page.getByRole("heading", { name: "A small pause." }),
  ).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "Retry payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Good things are on their way." }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
});
test("customer login exposes real account order history", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("DemoCustomer!2026");
  await page.getByRole("button", { name: "Sign in ↗", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your orders" }),
  ).toBeVisible();
});
