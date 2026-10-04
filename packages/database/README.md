# Commerce database

PostgreSQL transactional schema and deterministic local demo seed. Prisma 6.19 provides the shared server-only client; consumers import `PrismaClient`, `Prisma`, or the singleton `db`/`prisma` from `@commerce/database`. Persistence models must not be imported into browser bundles.

```sh
export DATABASE_URL='postgresql://commerce:commerce@localhost:5432/commerce'
pnpm --filter @commerce/database generate
pnpm --filter @commerce/database migrate
pnpm --filter @commerce/database seed
```

The initial migration includes database CHECK constraints Prisma cannot represent: valid money and quantity bounds, inventory reservation limits, exact order totals, rating bounds, finite payment/order/reservation statuses. The domain layer must also enforce allowed state transitions and use transactions for multi-row writes. `db push` bypasses these protections: use migrations.

## Transaction boundaries

- Inventory: update rows atomically under `onHand - reserved >= requested` predicates, create reservation in the same transaction, then commit or release with a status compare-and-set. Stock is held per variant and warehouse. A read-then-write without a predicate can oversell.
- Checkout: unique `IdempotencyRecord(scope,key)` stores request fingerprint and response. The order, immutable item/address snapshots, reservations and outbox event belong in one transaction.
- Tender allocation: `Order.totalCents` remains the total purchase value. Immutable `giftCardAppliedCents` and `giftCardCode` snapshot the stored-value contribution; `Payment.amountCents` records cash capture and `giftCardCents` records gift tender. `Refund.amountCents` is the total with exact `cashAmountCents + giftCardAmountCents` allocation; gift refunds replenish the gift ledger and cash refunds go to the provider. `Payment.refundedCents` tracks cumulative total refunds, bounded by both captured tenders.
- Payment: unique provider reference and `(provider,eventId)` webhook identity prevent duplicated capture events. Refund requests have unique idempotency keys; payment cumulative refund must remain bounded by captured amount.
- Promotions: redemption has a unique order reference. Check and increment coupon usage in the order transaction; never infer remaining quota from an unlocked read.
- Events: outbox `dispatchedAt` records queue acknowledgement, `processedAt` records successful handler completion. Re-delivery must use the same outbox ID and an idempotent handler.
- Financial/operational ledgers retain signed movements and immutable references. Catalog edits do not rewrite historical order snapshots.

## Demo data

The seed refuses `NODE_ENV=production` and refuses a database containing products. Rebuild a disposable local database for reset; no seed command truncates arbitrary records. Fixtures use stable identifiers and a fixed historical anchor (2026-09-30). Passwords are Argon2id hashes with fresh salts; business data is deterministic.

| Entity            |                          Count |
| ----------------- | -----------------------------: |
| Products          |                            120 |
| Variants          |                            360 |
| Categories        |                             12 |
| Brands            |                             10 |
| Collections       |                              6 |
| Warehouses        |                              2 |
| Inventory rows    |                            720 |
| Customer accounts | 100 plus customer demo account |
| All users         |                            104 |
| Historical orders |                            300 |
| Reviews           |                            250 |
| Analytics events  |                          1,000 |

Reviews marked verified correspond to the seeded matching successful orders; unpaid/failed/cancelled examples are unverified. Seeded orders include snapshots, payment attempts, refund records where applicable, delivered/shipped fulfillments and returned orders. Refunds do not change historical gross totals.

| Account              | Password          | Role              |
| -------------------- | ----------------- | ----------------- |
| customer@example.com | DemoCustomer!2026 | Customer          |
| admin@example.com    | DemoAdmin!2026    | All permissions   |
| ops@example.com      | DemoOps!2026      | Operations        |
| viewer@example.com   | DemoViewer!2026   | Read-only analyst |

Customer001–Customer100 use `customerNNN@demo.local` and the customer demo password. These are intentionally public local demo credentials, not production defaults.

Local generated imagery is served by the web application at `/images/products/{category}.svg`; the seed does not depend on an external image host.

## Schema boundaries

Core state is normalized: users/role memberships/permissions, catalog/category and collection bridges, options/values, inventory/reservations/movements, carts, order snapshots, payments/refunds, fulfillment/shipment events, returns, reviews, promotion rules and ledgers. JSON is limited to variable specifications/options snapshots/preferences/event payloads; option identities remain normalized too. Audit actor IDs and immutable historical product references are intentionally nullable/scalar to preserve history. Engagement and CMS models supply persistence primitives; their existence alone does not imply every application workflow is complete.

Migrations are forward-only. Production restores use a tested `pg_dump`/`pg_restore` backup and a separate database, rather than destructive down-migrations on financial history. Take a backup before deploy, apply migrations once, and roll forward with a repair migration when needed.
