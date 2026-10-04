import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma, Prisma } from "@commerce/database";
import { serial } from "../src/helpers";
const conflict = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("raw transaction failure", {
    code: "P2010",
    clientVersion: "6.19.0",
    meta: { code },
  });
afterEach(() => vi.restoreAllMocks());
describe("transaction contention regression", () => {
  it.each(["40001", "40P01"])(
    "retries PostgreSQL %s exposed by a raw locking query",
    async (code) => {
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockRejectedValueOnce(conflict(code))
        .mockResolvedValueOnce("committed");
      await expect(serial(async () => "committed")).resolves.toBe("committed");
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );
  it("returns a bounded conflict after repeated serialization failures", async () => {
    const transaction = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValue(conflict("40001"));
    await expect(serial(async () => "committed")).rejects.toMatchObject({
      status: 409,
    });
    expect(transaction).toHaveBeenCalledTimes(4);
  });
  it("does not retry unrelated SQL permission failures", async () => {
    const failure = conflict("42501");
    const transaction = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValue(failure);
    await expect(serial(async () => "committed")).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
