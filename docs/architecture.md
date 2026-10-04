# Architecture

FIELDWORK is a fictional multi-category retailer. PostgreSQL owns all transactional state; browser state never defines prices, discounts, refundable money or available inventory. Next.js serves public pages and interactive account/commerce/admin islands; a same-origin rewrite forwards /api/v1 to NestJS. Storefront pages read API data and have explicit error states when it is unavailable.

Money is integer cents. Orders snapshot product names, options, prices and shipping addresses. Reservations use stable-order row locks and transactions; sensitive operations persist request hashes and idempotent responses. Database CHECK constraints protect non-negative balances, reservation bounds and money arithmetic. An outbox saved inside each business transaction drives post-commit work.

The worker translates durable outbox rows into BullMQ jobs. SMTP, search and S3 are adapters with local Docker services. Jobs retry with bounded exponential backoff; records expose failures. Queue delivery is at-least-once, so handlers maintain stable event references. SMTP cannot provide exactly-once external delivery across a crash after send.

PostgreSQL connection-pool concurrency is tested separately from embedded PostgreSQL-engine checks. A successful in-process or single-backend check is not proof of last-unit safety across replicas.

Code boundaries: apps/web, apps/api, apps/worker, packages/database, packages/integrations. The brief's additional shared UI/config/contract packages should be extracted only where there is genuine reuse; do not add empty packages to imitate architecture. Current storefront DTOs are intentionally public projections, not direct Prisma persistence model exports into browser code.
