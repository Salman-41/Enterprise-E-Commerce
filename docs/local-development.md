# Local development

Requirements: Node24, pnpm11.25, Docker Compose, at least8GB memory. Run infrastructure without containerizing development apps to reduce overhead. `cp .env.example .env`, `pnpm install`, `docker compose -f docker/compose.yml up -d`, export your .env variables into the shell (or use Node's --env-file for direct processes), `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, then `pnpm dev`.

`pnpm dev` explicitly loads the root .env and propagates variables. Database commands need DATABASE_URL in their environment. Seed refuses a populated catalog rather than wiping data. It also refuses NODE_ENV=production. Use a separate throwaway database for tests, never run transaction fixture tests against production.

Ports: web3000; API4000; PostgreSQL5432; Redis6379; search7700; MinIO9000/9001; Mailpit1025/8025. Services bind host ports to loopback. Example infrastructure passwords are for isolated local development; replace via environment in deployment.

The default mock provider is a real deterministic local state transition, never a real charge. Choose mock decline to test retry. Stripe adapter uses test keys only; provider wiring/verification status is documented separately.

Search availability must re-check PostgreSQL publication state. Outbox delivery needs worker + Redis; SMTP/search/storage endpoints must be configured and healthy for their jobs. Failures appear as failed jobs and should not be described as completed deliveries.
