# Background processing and adapters

The dedicated worker uses PostgreSQL `OutboxEvent` as its durable source, BullMQ/Redis as its execution queue, and `JobRecord` as an operational history. The API writes events inside the same transaction as domain mutations. A dispatcher polls batches of 100 unfinished events every two seconds. The event ID is the BullMQ job ID; completed jobs are retained so redispatch cannot create a second queued job. Redis loss is recoverable by redispatching unfinished PostgreSQL events. Keep Redis persistence enabled and never purge queues casually.

Handlers retry five times with exponential backoff beginning at one second. Failures preserve the error and attempts in PostgreSQL. Unknown event types fail visibly. Admin retries should reset the outbox attempts and retry the existing BullMQ failed job, rather than changing the event ID. Retained jobs require a deliberate retention/archive policy before production; blindly deleting completed Redis jobs can undermine duplicate suppression during a crash window. Current worker concurrency is one to keep the local SMTP/stock alert side effects serialized. Multiple workers need a delivery lease before increasing SMTP concurrency.

## Event contract

| Type                             | Payload                                              | Effect                                                                                          |
| -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `email.send`                     | `to`, `subject`, `text`, optional `html`, `template` | SMTP delivery and persistent delivery log                                                       |
| `catalog.changed`                | `productId`                                          | Upsert published product or delete draft from Meilisearch                                       |
| `inventory.changed`              | `productId`                                          | Update availability; send requested back-in-stock alerts                                        |
| `order.placed` / `order.shipped` | `orderId`                                            | Read current order and send tracking receipt/status notification                                |
| `search.reindex`                 | `{}`                                                 | Cursor-based full rebuild, including removal of unpublished products                            |
| `reservations.expire`            | `{}`                                                 | Lock expired active reservations; atomically release reserved stock and ledger movement         |
| `carts.remind`                   | `{}`                                                 | Reminder for verified, active customers who explicitly opted into `preferences.marketingEmails` |
| `export.orders`                  | `requestedBy`                                        | Bounded CSV export to object storage and private notification containing object key             |

Reservation cleanup runs every minute, abandoned-cart eligibility hourly. A checkout that already succeeded cannot be released: expiry only changes `active` rows, and the API must similarly claim reservation state in its transaction. Failed reservation accounting aborts the entire batch rather than hiding a negative inventory discrepancy. Search availability accounts for safety stock and reservations; unpublished products never enter the index. The source-of-truth API must still validate publication after search retrieval because asynchronous indexes can briefly lag a catalog change.

`pnpm --filter @commerce/worker reindex` records a full rebuild event. Start the worker before running search queries. The search adapter configures searchable/filterable/sortable fields and waits for asynchronous Meilisearch tasks to succeed before acknowledging an event.

## SMTP delivery semantics

Mailpit receives SMTP at `smtp://localhost:1025`; inspect messages at `http://localhost:8025`. Every email has a stable Message-ID and unique delivery idempotency key. A completed delivery is skipped on retry. SMTP cannot guarantee exactly-once delivery: a crash after provider acceptance but before the database update can duplicate an email. This is an explicit at-least-once boundary, not a claim of perfect delivery. A production provider supporting idempotency keys can close this gap. Payloads may contain verification tokens; never expose email payloads in public job APIs and use retention/redaction policies.

## Object storage

The `ObjectStorage` adapter uses the AWS SDK against MinIO/S3. Signed uploads expire after five minutes. Accepted types are JPEG, PNG, WebP and PDF, 1 byte–10 MiB, with opaque UUID keys in an authenticated owner's prefix. API must record issued keys and finalize an upload by checking ownership, Content-Type, actual length and magic bytes before attaching it to media. Bucket contents are private. Signed downloads require API authorization; export object keys are not public URLs. Virus scanning, image decoding/re-encoding and quarantine are production additions. Do not allow SVG/HTML to run in the storefront origin.

Exports contain operational order numbers/status/currency/totals/dates, not customer PII. CSV cells are quoted and spreadsheet formulas escaped. The local export has a 100,000-order bound; larger exports should use streaming multipart storage rather than growing memory.

## Payments

`StripeTestProvider` accepts only `sk_test_` credentials and creates intents with provider idempotency keys. `verifyStripeSignature` authenticates the raw, unmodified HTTP bytes with HMAC and a five-minute replay window. The API must additionally store provider event IDs, validate merchant currency/amount/order association, and apply state changes transactionally. The local mock provider does not need external keys. Stripe execution is conditional on developer test keys; no live payment processing is enabled.

## Required configuration

`DATABASE_URL`, `REDIS_URL`, `MEILISEARCH_URL`, `MEILISEARCH_API_KEY`, `SMTP_URL`, `EMAIL_FROM`, `WEB_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. MinIO bucket provisioning belongs to Docker initialization. With workers inside containers, use service DNS names rather than localhost.

The worker intentionally does not pretend to implement image transformation, arbitrary webhook retries, analytics rollup or review solicitation without a defined event and verified domain workflow. Those are tracked separately from the implemented handlers above.
