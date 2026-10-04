import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@commerce/database";
import type { ProductSearch, SmtpEmailProvider } from "@commerce/integrations";
import { Handlers } from "../src/handlers.js";

function setup(db: unknown) {
  const search = { remove: vi.fn(), upsert: vi.fn() };
  const email = { send: vi.fn().mockResolvedValue({ messageId: "message" }) };
  return {
    handlers: new Handlers(
      db as PrismaClient,
      search as unknown as ProductSearch,
      email as unknown as SmtpEmailProvider,
    ),
    search,
    email,
  };
}
describe("background side effects", () => {
  it("removes an unpublished product rather than indexing it", async () => {
    const { handlers, search } = setup({
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "draft", status: "draft" }),
      },
    });
    await handlers.index("draft");
    expect(search.remove).toHaveBeenCalledWith("draft");
    expect(search.upsert).not.toHaveBeenCalled();
  });
  it("does not send a previously delivered email during retry", async () => {
    const { handlers, email } = setup({
      emailDelivery: {
        upsert: vi.fn().mockResolvedValue({ id: "delivery", status: "sent" }),
      },
    });
    await handlers.deliver(
      "event",
      { to: "user@example.com", subject: "Receipt", text: "Paid" },
      "receipt",
    );
    expect(email.send).not.toHaveBeenCalled();
  });
  it("records failure and rethrows so BullMQ applies retry policy", async () => {
    const update = vi.fn();
    const { handlers, email } = setup({
      emailDelivery: {
        upsert: vi.fn().mockResolvedValue({ id: "delivery", status: "queued" }),
        update,
      },
    });
    email.send.mockRejectedValueOnce(new Error("SMTP offline"));
    await expect(
      handlers.deliver(
        "event",
        { to: "user@example.com", subject: "Receipt", text: "Paid" },
        "receipt",
      ),
    ).rejects.toThrow("SMTP offline");
    expect(update).toHaveBeenCalledWith({
      where: { id: "delivery" },
      data: { status: "failed", error: "SMTP offline" },
    });
  });
  it("fails unknown events instead of silently marking them complete", async () => {
    const { handlers } = setup({});
    await expect(
      handlers.process({ id: "1", type: "not-implemented", payload: {} }),
    ).rejects.toThrow("Unsupported event");
  });
});
