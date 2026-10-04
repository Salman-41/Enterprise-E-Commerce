import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, prisma as db } from "@commerce/database";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { CommerceRequest } from "./security";
export const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  return r.data;
};
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Tx = Prisma.TransactionClient;
export const orderInclude = {
  items: true,
  addresses: true,
  history: { orderBy: { createdAt: "asc" as const } },
  payments: { include: { attempts: true, refunds: true } },
  fulfillments: {
    include: { items: true, shipments: { include: { events: true } } },
  },
  returns: { include: { items: true, events: true } },
};
export async function audit(
  tx: Tx,
  req: CommerceRequest,
  action: string,
  entity: string,
  entityId: string,
  after?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: {
      actorId: req.actor?.id,
      action,
      entity,
      entityId,
      requestId: req.requestId,
      ip: req.ip,
      after,
    },
  });
}
export async function emit(
  tx: Tx,
  type: string,
  payload: Prisma.InputJsonValue,
) {
  await tx.outboxEvent.create({ data: { type, payload } });
}
export async function serial<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let n = 0; n < 4; n++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 20000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(e.code) &&
        n < 3
      )
        continue;
      throw e;
    }
  }
  throw new ConflictException("Please retry your request");
}
export async function idempotent<T>(
  tx: Tx,
  scope: string,
  key: string,
  body: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  if (!/^[\w.:-]{8,128}$/.test(key))
    throw new BadRequestException(
      "Idempotency-Key must be 8–128 safe characters",
    );
  const requestHash = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  const existing = await tx.idempotencyRecord.findUnique({
    where: { scope_key: { scope, key } },
  });
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new ConflictException(
        "Idempotency key was already used for different input",
      );
    return existing.response as T;
  }
  const result = await fn();
  await tx.idempotencyRecord.create({
    data: {
      scope,
      key,
      requestHash,
      response: JSON.parse(JSON.stringify(result)),
      statusCode: 200,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return result;
}
