# AGENTS.md

This repository's agent instructions live in **[CLAUDE.md](./CLAUDE.md)** — read it first. The engineering standards in `docs/engineering-standards/` are authoritative, and project skills live in `.claude/skills/`.

## TL;DR for coding agents

- Haidara backend (Fastify + Prisma + PostgreSQL): auth/RBAC/audit/files/settings foundations plus master data, customers, complaints, call center, communication templates, reports and integrations. No survey domain.
- Backend is the security authority. No plaintext passwords (argon2id only). `passwordHash` never leaves the server.
- Permissions are enforced automatically from route `schema.permissions`. Never write a manual guard; never rely on absence of a permission to mean "public" — public routes live under `routes/public/` and set `public: true`.
- Contract-first: every route has a zod schema; OpenAPI is the source of truth.
- Throw `AppError` with a stable `code`; never branch on localized messages; never `try/catch` to build error responses.
- Multi-step writes use `withTransaction`; concurrency-sensitive sections use advisory locks; external side effects use `runIdempotent`.
- Enforce uniqueness with DB constraints + normalized values. Audit sensitive changes via `request.setAudit`. Never log secrets.
- Before claiming done: `npm run typecheck && npm run lint && npm run build && npm test`.

## Diamond contracts (critical)

- Contract is the rental aggregate. Canonical path: AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED.
- Car-In → REVIEW only. Vehicle becomes AVAILABLE only at CLOSE. Protect PAID/ACTIVE/renewal/CLOSE with `vehicle_rental` advisory locks.
