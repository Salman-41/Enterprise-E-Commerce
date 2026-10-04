# Delivery plan

The supplied Word brief is preserved as `docs/build-brief.txt`. The repository was empty on 4 October 2026. Package registry checks confirmed Next.js16.3.8, React19.3.0 and NestJS12.1.2. Prisma6.19 is deliberately pinned to a stable supported engine rather than the registry's Prisma8 release candidate.

1. Relational schema, SQL constraints, deterministic seed, Docker infrastructure.
2. Authentication, public catalog, persistent cart and secure API conventions.
3. Transactional checkout, mock payment, inventory reservation, retry, idempotence and outbox.
4. Orders, fulfillment, returns/refunds and RBAC operations console.
5. Engagement, content, search/email/storage adapters and durable worker.
6. Unit, transaction integration and browser flows; fix observed failures.
7. Production build, reproducible documentation, screenshots and GitHub publication.

Implementation status and verification evidence will be recorded in `docs/verification.md`. Schema presence and interface adapters are not equivalent to a completed end-to-end feature. External payment behavior is explicitly test mode. Demo tax/shipping rules are fictional deterministic business rules.
