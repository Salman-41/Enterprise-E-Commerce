# Commerce operations

The `/admin` workspace uses the same FIELDWORK identity as the storefront, with a denser operations layout. Every displayed record comes from the dedicated API. The frontend does not simulate successful mutations or generate dashboard numbers.

## Working paths

- Overview reads database aggregates and ranked operational records.
- Catalog edits publication status, price, description, image reference and brand; creation includes an initial SKU. Existing variants can be edited independently, including SKU, price and backorder policy.
- Inventory includes stock movement history and a bounded CSV adjustment import. The import validates headers, integer quantities, reasons, duplicate records and versions before sending writes; each accepted row is committed independently, with a per-row report.
- Inventory adjustments carry the last-read version and a reason. The API rejects stale or invalid adjustments.
- Orders support shipment creation, cancellation and refunds. Financial operations require confirmation; refund calls carry an idempotency key.
- Returns use explicit approve/reject/receive/refund operations with a restock choice.
- Promotions configure type, dates, monetary threshold and usage limits.
- Reviews expose moderation decisions. Editorial content edits safe text and publication state.
- Customers, roles, audit, jobs and webhooks expose operational records with inspectable details; failed jobs can be retried with confirmation. Gift cards can be issued with ledger-backed credit, and loyalty accounts expose points and ledger history. Feature flags and health use their system APIs.

## Table behavior

Search, status filtering, sorting and pagination are server operations. Column visibility is local presentation state. CSV exports the first 100 matching records, visibly documented after download; filter to obtain a complete bounded batch. Spreadsheet formula prefixes are neutralized. Exports do not fetch private columns outside the authorized API response.

## Security and accessibility

The UI reads `/auth/me` and hides write actions when the role lacks the relevant permission. The API remains the authority and rejects unauthorized operations independently. Session cookies travel through the same-origin Next.js API rewrite. Expired sessions and forbidden actions display a clear error and account link.

Native modal dialogs keep focus inside the editor and support Escape. Inputs have labels, tables have headings, errors use `role=alert`, success feedback uses `role=status`, and unsaved changes require a discard confirmation. Inventory/refund/cancel/return changes require an explicit confirmation. The responsive navigation becomes a horizontally scrollable rail on small screens.

## Validation

`node --test tests/admin.test.mjs` checks CSV injection protection, field preservation, joined-record rendering, cookie transport/authorization errors, idempotency header preservation and inventory CSV validation. Full browser operations require API + seeded PostgreSQL; the root E2E suite can exercise representative catalog, inventory and refund flows.
