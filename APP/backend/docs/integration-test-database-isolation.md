# Integration test database isolation

Integration tests must never write to operational PostgreSQL (`haidara`).

## Load order

1. `tests/helpers/integration-bootstrap.ts` is registered with `node --import` **before** any test file or application module.
2. Bootstrap copies `TEST_DATABASE_URL` → `process.env.DATABASE_URL` and sets `DIAMOND_INTEGRATION_SUBPROCESS=true`.
3. Only then may `src/config/env` or Prisma load.

Entry points:

- `npm run test:integration` / `scripts/run-integration-tests.ts` — bootstrap via `--import`.
- `scripts/run-integration-file.ts` — same bootstrap for single-file runs.
- `npm test` — unit tests only; does **not** run `tests/integration/*.test.ts`.

## Fail-closed guards

- `src/lib/db/integration-database-guard.ts` — `assertTestDatabaseUrl`, `assertPrismaDatabaseUrlAllowed`.
- `src/plugins/prisma.ts` — refuses operational DB names when `RUN_INTEGRATION` / subprocess flag is set.

## Operational recovery (read-only)

- `scripts/backup-operational-haidara.ts` — `pg_dump` of `haidara` only.
- `scripts/audit-deferred-contamination.ts` — read-only contamination graph.
- `scripts/provision-contamination-lab.ts` + `scripts/contamination-cleanup-lab.ts` — validate cleanup on `haidara_contamination_lab` only (`LAB_DATABASE_URL`).
