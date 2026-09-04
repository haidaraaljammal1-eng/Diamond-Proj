# Haidara Backend

A secure, contract-first backend built on **Fastify 5 + TypeScript + Prisma 7 + PostgreSQL**.

It ships auth (with refresh-token rotation), RBAC with **automatic permission enforcement**, audit logging, notifications, secure file handling, settings and an OpenAPI contract, plus an operational core: master data, customers and purchase experiences, a full complaints lifecycle, a call-center queue, versioned communication templates, reports with XLSX/PDF export, and integrations with an external API. Build your product domain on top.

## Purpose

Use this as the foundation for a new backend. The cross-cutting concerns are done right, so you add your domain modules and nothing else.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 20+ / TypeScript (CommonJS) |
| Framework | Fastify 5 |
| Validation / contract | Zod 4 + `fastify-type-provider-zod` → OpenAPI |
| ORM | Prisma 7 (PostgreSQL driver adapter) |
| Passwords | argon2id (`@node-rs/argon2`, prebuilt binaries) |
| Auth | Short-lived JWT access token + opaque, hashed, rotating refresh token |
| Logging | pino (with redaction) |
| Email | nodemailer (capability-gated) |
| Tests | `node:test` + `tsx` |

## Getting started

```bash
cp .env.example .env          # then edit secrets (min 32 chars each)
npm install
npm run db:generate           # prisma generate (also emits src/schemas/zod)
npm run db:migrate            # create + apply the initial migration
npm run db:seed               # idempotent generic seed
npm run dev                   # http://localhost:3000, docs at /docs
```

### Environment

Startup **fails fast** if a required variable is missing or invalid (`src/config/env.ts`). See `.env.example` for the full, documented list. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` — min 32 chars each
- `ACCESS_TOKEN_TTL` (default 900s), `REFRESH_TOKEN_TTL` (default 30d)
- `CORS_ORIGINS` — comma-separated allow-list (no `*` in production)
- `SEED_DEV_ADMIN` + `DEV_ADMIN_PASSWORD` — env-gated development admin

### Database setup, migrate, seed

```bash
npm run db:migrate     # dev: prisma migrate dev
npm run db:deploy      # prod: prisma migrate deploy
npm run db:seed        # permissions, system_admin role, notification defs, (dev admin)
```

The seed is **idempotent** — re-running it changes nothing. No welcome email is sent during seeding, and no credentials are hardcoded.

### Run / build / test

```bash
npm run dev            # hot reload
npm run build          # tsc -> dist, then tsc-alias
npm start              # run dist/src/server.js
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # unit tests (no DB); integration self-skips unless RUN_INTEGRATION=true
```

Run the full security suite against a disposable database:

```bash
RUN_INTEGRATION=true npm run test:integration
```

### OpenAPI

Swagger UI is served at `/docs` in development. Export the contract:

```bash
npm run openapi:export     # writes openapi.json (source of truth for the client SDK)
```

## Architecture

Boot chain: `src/server.ts` → `src/app.ts` (builds Fastify, sets the zod type provider, global error/not-found handlers) → `src/plugins/index.ts` (ordered plugin registration) → `src/plugins/autoload.ts` (role-based route loading).

### Adding a module

1. Create `src/modules/<feature>/` with `<feature>.schema.ts`, `<feature>.service.ts`, and `routes/<accessLevel>/route.ts`.
2. `<accessLevel>` is `public`, `user`, or `admin`. The folder maps to the URL with `routes/` and the access-level segment stripped:
   `modules/reports/routes/admin/route.ts` → prefix `/reports`.
3. Each route declares a zod `schema` with `summary`, `operationId`, `tags`, `response`, and — for protected routes — `permissions: ["resource.action"]`.
4. Add new permission keys to `src/constants/permissions.ts` (they seed automatically).
5. Keep business logic in the service; the route handler only validates, delegates, and returns.

To add a new access level: create `src/services/roles/<name>/hook.ts` and register it in `src/plugins/autoload.ts`.

### Auth architecture

- **Login** issues a short-lived JWT **access token** and an opaque **refresh token**.
- Refresh tokens are stored **hashed** (`AuthSession.refreshTokenHash`), are **revocable**, and **rotate** on every use.
- **Reuse detection**: presenting an already-rotated refresh token revokes the entire token family (forces re-login).
- Setting a new password revokes all sessions. Suspending a user blocks login and revokes sessions.

### Refresh tokens

`POST /auth/refresh` with `{ refreshToken }` → new access + refresh pair; the old refresh token is immediately invalid. See `src/modules/auth/auth.service.ts`.

### RBAC + permission metadata

`User → UserRole → Role → RolePermission → Permission`. Permissions are strings (`users.read`). A route declares `permissions` in its schema; the **always-on** `enforcePermissions` preHandler (applied by every authenticated access level) enforces them automatically. **There is no manual permission call to forget.** Absence of a permission never makes a route public — only placing it under `routes/public/` does.

### Errors

Throw `AppError` (never `try/catch` to build a response). One global handler emits a single envelope:

```jsonc
{ "error": { "code": "NOT_FOUND", "message": "…", "details": …, "requestId": "…" } }
```

The frontend branches on the stable `code`, never on the localized `message`.

### Transactions, advisory locks, idempotency

- `withTransaction(prisma, fn)` — atomic multi-step writes (`src/lib/db/transaction.ts`).
- `acquireAdvisoryLock(tx, namespace, id)` — PostgreSQL transaction-scoped locks for capacity / allocation / reassignment (`src/lib/db/advisory-lock.ts`).
- `runIdempotent(prisma, { scope, key }, effect)` — create-first idempotency for notifications, emails, and external effects (`src/lib/db/idempotency.ts`).

### Audit

Handlers enrich context with `request.setAudit({ action, entityType, entityId, metadata })`; the centralized writer persists one sanitized row per mutating request. Secrets are stripped and PII masked before write. Read-only API at `GET /audit`.

### Notifications

Generic pipeline: event → caller-resolved recipients → per-recipient preferences → channel selection → deliver → dedupe → delivery log. `fastify.notify.send({ eventKey, userIds, title, body })`. Users only ever see their own notifications.

### Files

Uploads and downloads are **authenticated and permission-gated**. Uploads validate size, allowed MIME, and **magic bytes** (content sniffing — the declared Content-Type is never trusted), and are stored under a **server-generated key** (never the original filename). Downloads never expose a filesystem path.

### Settings + capabilities

Typed settings accessors (`fastify.settings.getBoolean(...)`). Secret settings are never returned by the public endpoint. `GET /capabilities` exposes safe runtime flags so the frontend can disable features **with a reason** instead of faking them.

## Security baseline

- Passwords: argon2id only. No plaintext, ever. `passwordHash` is globally omitted from query results and never serialized.
- Access tokens are short-lived; refresh tokens rotate and are revocable.
- Public routes must be **explicit** (`public: true` under `routes/public/`).
- Permission enforcement is centralized and automatic.
- Rate limiting: global baseline + stricter limits on auth endpoints. Reset endpoints do not reveal whether an account exists.
- CORS is an env allow-list; secrets are never logged (pino redaction) and stack traces are never sent to clients.

See `docs/engineering-standards/` for the full standards, and `docs/engineering-standards/KNOWN-LIMITATIONS.md` for what is intentionally out of scope (e.g. distributed scheduler, external notification providers).
