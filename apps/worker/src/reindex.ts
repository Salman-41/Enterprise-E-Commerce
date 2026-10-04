import "dotenv/config";
import { PrismaClient } from "@commerce/database";
const db = new PrismaClient();
try {
  const event = await db.outboxEvent.create({
    data: { type: "search.reindex", payload: {} },
  });
  console.log(`Queued full search reindex: ${event.id}`);
} finally {
  await db.$disconnect();
}
