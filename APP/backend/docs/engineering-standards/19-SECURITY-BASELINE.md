# Security Baseline

## Passwords

- **argon2id only** (`src/lib/security/password.ts`). `hashPassword` / `verifyPassword`. Never store, compare, log, or return a raw password.
- `passwordHash` is nullable (until account setup), globally omitted from Prisma results, and must never appear in any response.

## Tokens & sessions

- **Access token:** JWT (`ACCESS_TOKEN_TTL`, default 7 days), signed with `JWT_ACCESS_SECRET`.
- **Refresh token:** opaque random value, stored **hashed** in `AuthSession`, revocable, **rotated** on every use, with **reuse detection** (revokes the token family).
- Password change/reset revokes all sessions. Suspending a user blocks login and revokes sessions.
- Reading identity on the hot path is read-only; `lastSeen` updates are throttled and fire-and-forget.

## Account setup / reset

Admin creates a user → single-use, scoped, **hashed-at-rest** setup token → user sets a password → account activated. Reset uses the same mechanism with a different scope. A ready-made password is never emailed. Reset endpoints never reveal whether an account exists.

## Authorization

Centralized, automatic, metadata-driven (see `09-PERMISSIONS-AND-RBAC.md`). Public routes are explicit.

## Files

Authenticated + permission-gated. Validate size, allowed MIME, and **magic bytes** (content sniffing — the client Content-Type is never trusted). Store under a **server-generated key** (never the original filename); downloads never expose a filesystem path; path traversal is rejected (`resolveStoragePath`).

## Rate limiting

Global baseline plus stricter per-endpoint limits on auth routes (`authRateLimit()`). Per-instance/in-memory (see `KNOWN-LIMITATIONS.md`).

## CORS & headers

CORS is an env allow-list (`CORS_ORIGINS`); no `*` in production (enforced by env validation). `@fastify/helmet` sets security headers. CSP for browser-served content is typically owned by the frontend/reverse proxy.

## Logging

Structured pino with redaction of authorization/cookie headers and secret-keyed fields. Never log passwords, tokens, or authorization headers. Every request carries a `requestId`.

## Database constraints

Uniqueness is enforced by a DB unique index **and** application validation, on the normalized/canonical value (e.g. normalized email, unique permission/role key, unique idempotency key). Do not rely on application checks alone.

## Environment

Startup fails fast on missing/invalid config. Secrets are ≥32 chars; production rejects placeholder secrets, `*` CORS, and `SEED_DEV_ADMIN=true`. No real secrets, domains, emails, or phone numbers are committed.
