# Verification and delivery status

Recorded 4 October 2026. Results describe this revision and execution environment, not production performance.

## DONE

- Database schema, two SQL migrations and deterministic seed. Executed migrations in PGlite (embedded PostgreSQL); seed printed 120 products / 360 variants / 104 users / 300 orders / 250 reviews / 720 inventory rows.
- All five packages passed TypeScript checks. API compiled; Next.js production build generated 27 routes.
- Unit tests: 5 API + 5 integration adapter + 4 worker + 9 frontend tests passed. The native database worker integration test requires TEST_DATABASE_URL and was skipped locally.
- Real HTTP API suite: 57 assertions passed. Coverage includes checkout replay/input conflict, authorization, gift decline/retry, coupon usage caps, last-unit contention, signed webhooks, fulfillment and cash/gift refund replay.
- Fixed JSONB key-order-dependent webhook deduplication found by the suite.
- Source formatting and ESLint checks passed independently from TypeScript.
- Six Playwright E2E flows passed (13.7 seconds) against the production Next.js server/API using Chromium headless shell: catalog edit + stock ledger, partial refund, read-only RBAC, guest purchase/tracking, declined-payment retry, customer login/history.
- Actual desktop/mobile/store operations screenshots captured and visually inspected.
- Actual background smoke check passed: PostgreSQL outbox → Redis 7 / BullMQ → running worker → local SMTP server; completed JobRecord, processed OutboxEvent and received message verified.
- Fixed asynchronous brand selection in the editor and missing inventory/review permissions in the deterministic seed.

## IN PROGRESS

- Final GitHub publication and CI confirmation.

## BLOCKED / NOT VERIFIED

- Full Chromium initially failed before page load because this environment denies its process-singleton Unix socket. Standard Chromium headless shell ran successfully; all six flows passed. CI installs normal Chromium on Ubuntu.
- Docker daemon unavailable. Compose and image builds have not been exercised here.
- Native multi-backend PostgreSQL concurrency was not available locally. PGlite multiplexes/serializes connections; CI uses PostgreSQL 17 to exercise integration tests.
- Meilisearch/MinIO end-to-end delivery and Stripe test account behavior remain unverified. SMTP was exercised against a local test SMTP server; Mailpit itself was not launched. Adapter and mocked worker tests passed.
- No live deployment or production benchmarks are claimed. Screenshots are actual local captures; their order/revenue values come from fictional fixtures.

## NEXT

1. Confirm native PostgreSQL migration/HTTP/worker integration tests and browser flows through CI; fix any platform-specific failures.
2. Exercise SMTP, Meilisearch indexing/rebuild and private bucket exports against Compose services.
3. Add production deployment secrets, backups, shared rate limiting, resource limits and observability.
4. Wire a real provider's test flow with merchant amount/currency validation before enabling payment integration.
5. Expand accessibility and tablet/device coverage beyond the six exercised browser journeys.

## Correctness boundaries

All monetary inputs are integer cents. Demo taxes/shipping and seeded commerce history are fictional. Session access is checked before idempotent replay. Split refund totals are bounded by original captured tender. Transactional outbox guarantees committed event persistence, not exactly-once external delivery. Current in-process API rate limiting does not coordinate across replicas. Operational read-only tables and schema-only capabilities are identified in the admin/integration docs.
