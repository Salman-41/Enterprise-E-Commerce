import { test, expect, type Page } from "@playwright/test";
async function login(
  page: Page,
  email = "admin@example.com",
  password = "DemoAdmin!2026",
) {
  await page.goto("/account");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in ↗", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
}
test.describe("Commerce operations", () => {
  test("admin edits a seeded product and records a stock movement through accessible forms", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/admin/products");
    await expect(
      page.getByRole("heading", { name: "Catalog", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Manage / })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    const title = dialog.getByLabel("Product title");
    const original = await title.inputValue();
    const edited = `${original} · operations test`;
    await title.fill(edited);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Change saved" }),
    ).toContainText("Change saved");
    await expect(
      page.getByRole("cell", { name: edited, exact: true }),
    ).toBeVisible();
    // Restore the catalog record so the suite does not depend on accumulated mutations.
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: edited, exact: true }) })
      .getByRole("button", { name: /Manage / })
      .click();
    await page.getByRole("dialog").getByLabel("Product title").fill(original);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Change saved" }),
    ).toContainText("Change saved");
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/admin/inventory");
    await page
      .getByRole("button", { name: /Manage / })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Adjustment quantity (positive or negative)")
      .fill("1");
    await page
      .getByRole("dialog")
      .getByLabel("Reason", { exact: true })
      .fill("Playwright stock verification");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Change saved" }),
    ).toContainText("Change saved");
    await page.goto("/admin/audit");
    await expect(
      page.getByRole("cell", { name: "inventory.adjust", exact: true }).first(),
    ).toBeVisible();
  });
  test("admin issues a partial refund and API verifies the money change", async ({
    page,
  }) => {
    await login(page);
    const response = await page.request.get(
      "/api/v1/admin/orders?status=paid&limit=20",
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const order = data.items.find(
      (o: { payments: { amountCents: number; refundedCents: number }[] }) =>
        o.payments.reduce(
          (total, payment) =>
            total + payment.amountCents - payment.refundedCents,
          0,
        ) > 100,
    );
    expect(order).toBeTruthy();
    await page.goto("/admin/orders");
    await page.getByLabel("Search", { exact: true }).fill(order.number);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page
      .getByRole("button", { name: /Manage / })
      .first()
      .click();
    const editor = page.getByRole("dialog");
    await editor
      .getByRole("combobox", { name: "Action", exact: true })
      .selectOption("refund");
    await editor.getByLabel("Refund amount in cents").fill("100");
    await editor
      .getByLabel("Reason", { exact: true })
      .fill("Playwright partial refund");
    page.once("dialog", (dialog) => void dialog.accept());
    await editor
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Change saved" }),
    ).toContainText("Change saved");
    const after = await page.request.get(`/api/v1/admin/orders/${order.id}`);
    expect(after.ok()).toBeTruthy();
    const updated = await after.json();
    const refunded = (input: { payments: { refundedCents: number }[] }) =>
      input.payments.reduce(
        (total, payment) => total + payment.refundedCents,
        0,
      );
    expect(refunded(updated)).toBe(refunded(order) + 100);
  });
  test("read-only viewer cannot open mutation controls or bypass API authorization", async ({
    page,
  }) => {
    await login(page, "viewer@example.com", "DemoViewer!2026");
    await page.goto("/admin/products");
    await expect(
      page.getByRole("heading", { name: "Catalog", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create product", exact: false }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Manage / })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Inspect ↗" }).first(),
    ).toBeVisible();
    const response = await page.request.post("/api/v1/admin/products", {
      data: { name: "Forbidden" },
    });
    expect(response.status()).toBe(403);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });
});
