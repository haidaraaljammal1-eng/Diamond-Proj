# CLAUDE.md

Guidance for AI agents (and humans) working in this repository.

## What this is

**Haidara** — a backend built on Fastify 5 + TypeScript + Prisma 7 + PostgreSQL.

It ships the cross-cutting foundations (auth with refresh-token rotation, RBAC with
automatic permission enforcement, audit, notifications, files, settings, OpenAPI) plus
a working operational core:

- **Master data** — regions, cities, branches, departments, salespeople, vehicle models
- **Operational** — customers, vehicles, purchase experiences
- **Complaints** — full lifecycle: routing rules → SLA cycles → escalation → actions →
  resolution → closure → reopen, driven by a durable outbox
- **Call center** — claimable queue, call sessions, callbacks, recording metadata
- **Communication** — message templates with versions/variants, providers, email layout
- **Reports** — report library, scheduled runs, XLSX/PDF export (Arabic RTL aware)
- **Integrations** — provider catalog, encrypted configs, API keys + external API

It carries **no survey/CX-feedback domain**. Build your own product domain on top.

## Read first

Before non-trivial work, read `docs/engineering-standards/` — especially
`00-README.md`, `01-ARCHITECTURE-PRINCIPLES.md`, `09-PERMISSIONS-AND-RBAC.md`,
`19-SECURITY-BASELINE.md`, and `24-DEFINITION-OF-DONE.md`.

Project skills live in `.claude/skills/`: `add-module`, `prisma-change`,
`rbac-permission`, `verify-done`. Use them.

## Non-negotiable rules

- **The backend is the authority.** All authentication, authorization, and validation are enforced server-side. Frontend checks are UX only.
- **No plaintext passwords.** Use `hashPassword` / `verifyPassword` (argon2id). Never store, compare, log, or return a raw password. `passwordHash` is globally omitted and must never appear in an API response.
- **No forgotten permission guards.** Declare `permissions: ["resource.action"]` in a route's schema; the always-on `enforcePermissions` preHandler enforces it. Never rely on a manual per-handler permission call.
- **Public routes must be explicit.** A route is public only under `routes/public/`. Absence of a permission never means public.
- **No business assumptions.** Account status is about login only; it never cascades to domain entities.
- **No mock APIs or data.** Every endpoint is real and contract-backed.
- **Contract-first.** Every route has a zod schema (`summary`, `operationId`, `tags`, `response`). OpenAPI is the source of truth for the client.
- **DB validation + constraints.** Enforce uniqueness with a DB unique index *and* application validation, on the normalized/canonical value.
- **Transactions for multi-step writes.** Use `withTransaction`. Use advisory locks (`acquireAdvisoryLock`) for concurrency-sensitive sections.
- **Stable error codes.** Throw `AppError` with a stable `code`. Never branch on a localized `message`. Never `try/catch` to build an error response.
- **Audit sensitive changes.** Enrich `request.setAudit(...)`; the centralized writer persists it. Never log or audit secrets/tokens.
- **Never log secrets.** Use `request.log`; rely on pino redaction.
- **Verify before "done".** Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` before claiming completion.

## Conventions

- Routes: `src/modules/<feature>/routes/<public|user|admin>/route.ts`. The `routes/` and access-level folders are stripped from the URL.
- Handlers validate → delegate to a service → return `{ data, meta? }`. Business logic lives in services.
- User-facing text uses `t(key, { lng })` with keys in `src/locales/en.ts` + `ar.ts`.
- After editing `prisma/schema/*.prisma`, run `npm run db:generate`.
- Add permission keys to `src/constants/permissions.ts` (they seed automatically).
- Background work (call-center automation, complaint SLA cycles, scheduled reports) runs
  in-process via `src/plugins/scheduler.ts` → `src/worker/background-runner.ts`.
  `SCHEDULER_ENABLED=false` turns it off for API replicas when a dedicated worker runs it.

## Commands

`npm run dev | build | start | typecheck | lint | test`, `npm run dev:bootstrap | dev:check`, `npm run db:generate | db:migrate | db:deploy | db:seed | db:seed:demo`, `npm run openapi:export`.
