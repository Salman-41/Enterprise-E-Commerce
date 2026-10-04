import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { PrismaClient, Prisma } from "@commerce/database";
import {
  ProductSearch,
  SmtpEmailProvider,
  ObjectStorage,
} from "@commerce/integrations";
import { Handlers, type CommerceEvent } from "./handlers.js";

const db = new PrismaClient();
const redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  ...(redis.password ? { password: decodeURIComponent(redis.password) } : {}),
  ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
};
const queue = new Queue<CommerceEvent>("commerce-events", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: false,
    removeOnFail: false,
  },
});
const search = new ProductSearch(
  process.env.MEILISEARCH_URL ?? "http://localhost:7700",
  process.env.MEILISEARCH_API_KEY ?? "",
);
const storage =
  process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? new ObjectStorage(process.env.S3_BUCKET ?? "commerce", {
        endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
        region: process.env.S3_REGION ?? "us-east-1",
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      })
    : undefined;
const handlers = new Handlers(
  db,
  search,
  new SmtpEmailProvider(
    process.env.EMAIL_FROM ?? "Commerce <store@commerce.local>",
    process.env.SMTP_URL ?? "smtp://localhost:1025",
  ),
  storage,
);
const log = (
  level: string,
  event: string,
  fields: Record<string, unknown> = {},
) =>
  console.log(
    JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }),
  );
const worker = new Worker<CommerceEvent>(
  "commerce-events",
  async (job) => {
    const event = job.data;
    const outbox = await db.outboxEvent.findUnique({ where: { id: event.id } });
    if (outbox?.processedAt) return;
    await db.jobRecord.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        type: event.type,
        payload: event.payload as Prisma.InputJsonValue,
        status: "running",
        attempts: job.attemptsMade + 1,
      },
      update: {
        status: "running",
        attempts: job.attemptsMade + 1,
        error: null,
      },
    });
    try {
      await handlers.process(event);
      await db.$transaction([
        db.jobRecord.update({
          where: { id: event.id },
          data: { status: "completed", finishedAt: new Date(), error: null },
        }),
        db.outboxEvent.updateMany({
          where: { id: event.id },
          data: { processedAt: new Date(), error: null },
        }),
      ]);
      log("info", "job.completed", { jobId: event.id, type: event.type });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed";
      await db.$transaction([
        db.jobRecord.update({
          where: { id: event.id },
          data: {
            status: job.attemptsMade + 1 >= 5 ? "failed" : "retrying",
            error: message,
          },
        }),
        db.outboxEvent.updateMany({
          where: { id: event.id },
          data: { attempts: { increment: 1 }, error: message },
        }),
      ]);
      throw error;
    }
  },
  { connection, concurrency: 1 },
);
worker.on("error", (error) =>
  log("error", "worker.error", { message: error.message }),
);
worker.on("failed", (job, error) =>
  log("error", "job.failed", { jobId: job?.id, message: error.message }),
);
let stopped = false;
let dispatching = false;
async function dispatch() {
  if (dispatching || stopped) return;
  dispatching = true;
  try {
    // Reconsider all unprocessed events, including acknowledged dispatches: Redis loss cannot lose DB events.
    const events = await db.outboxEvent.findMany({
      where: { processedAt: null, attempts: { lt: 5 } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const event of events) {
      await queue.add(
        event.type,
        {
          id: event.id,
          type: event.type,
          payload: event.payload as Record<string, unknown>,
        },
        { jobId: event.id },
      );
      await db.outboxEvent.update({
        where: { id: event.id },
        data: { dispatchedAt: new Date() },
      });
    }
  } catch (error) {
    log("error", "outbox.dispatch_failed", {
      message: error instanceof Error ? error.message : "Dispatch failed",
    });
  } finally {
    dispatching = false;
  }
}
async function schedule(type: string, bucket: number) {
  const id = `${type.replaceAll(".", "-")}-${bucket}`;
  await db.outboxEvent.upsert({
    where: { id },
    create: { id, type, payload: {} },
    update: {},
  });
}
const timer = setInterval(() => void dispatch(), 2000);
const scheduleTimer = setInterval(() => {
  const now = Date.now();
  void Promise.all([
    schedule("reservations.expire", Math.floor(now / 60_000)),
    schedule("carts.remind", Math.floor(now / 3600_000)),
  ]).catch((error) =>
    log("error", "schedule.failed", { message: String(error) }),
  );
}, 60_000);
await search
  .configure()
  .catch((error) =>
    log("warn", "search.configuration_failed", { message: String(error) }),
  );
await dispatch();
log("info", "worker.ready");
async function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  clearInterval(scheduleTimer);
  await worker.close();
  await queue.close();
  await db.$disconnect();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
