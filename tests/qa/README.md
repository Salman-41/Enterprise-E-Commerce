# Commerce integration verification

`scripts/qa-api.ts` is an independent black-box HTTP + database-invariant suite. It does not replace PostgreSQL with mocks, fabricate requests, or hard-code API success responses.

Run on a disposable migrated and seeded PostgreSQL database, with the compiled API connected to the same `DATABASE_URL`:

```sh
QA_ALLOW_MUTATION=true QA_API_URL=http://localhost:4000/api/v1 pnpm exec tsx scripts/qa-api.ts
```

Fixtures use a unique run namespace and remain in the database for failure inspection. Never run this against production: it registers customers, creates products and gift cards, buys stock, and records refunds. Optional `QA_RUN_ID` is for reproducing a fresh fixture namespace, not reusing a previous successful namespace.

Checks include guest/signed-in checkout, cookie sessions, order ownership, tracking tokens, validation, administrator/customer separation, checkout/refund idempotency, input mismatch, failed-payment reservation release, gift tender on payment retry, fulfillment limits, return item limits, and two carts competing for the final stock unit. Inventory and refund counts are verified against the database after HTTP mutations.

An embedded PostgreSQL-compatible development engine can run functional checks when Docker is unavailable. Its single-process serialized behavior cannot validate production PostgreSQL concurrency under distributed load. The same suite must run against actual PostgreSQL in CI; distinguish the engines in any result report. No payment adapter test proves settlement with a real payment network: demo payments are explicitly simulated.
