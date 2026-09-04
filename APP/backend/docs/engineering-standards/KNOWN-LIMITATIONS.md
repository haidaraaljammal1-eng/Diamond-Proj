# Known Limitations

Nothing is hidden. Limitations fall into three buckets.

## Resolved from the reference implementation

These were security limitations in the backend this starter was distilled from; they are **fixed here**:

- **Plaintext passwords** → argon2id hashing; `passwordHash` globally omitted and never returned.
- **7-day access token, no refresh** → short-lived access token + rotating, hashed, revocable refresh token with reuse detection.
- **Manual, dev-only permission enforcement** → always-on, metadata-driven `enforcePermissions` preHandler.
- **Per-request identity writes on the hot path** → read-only auth; throttled, fire-and-forget `lastSeen`.
- **Public, MIME-only file uploads** → authenticated, permission-gated, magic-byte-validated uploads with server-generated storage keys.
- **Global-only rate limiting** → global baseline **plus** stricter auth-endpoint limits; reset endpoints don't reveal account existence.
- **Two divergent error envelopes** → one unified error envelope.
- **Uniqueness by application guard only** → DB unique constraints on normalized values.

## Intentionally not included

Out of scope for a generic starter; add per product:

- **2FA / OTP / TOTP** — the reference had it, but a half-built generic 2FA is worse than none. Add against the `SecurityToken`/session foundation when needed.
- **Realtime / WebSockets** — dropped to keep the surface small. In-app notifications are DB-backed and API-polled.
- **Distributed job queue / message broker** — not present. Add BullMQ/etc. only when a real need exists.
- **External notification providers (push/SMS/WhatsApp)** — channels exist in the model and pipeline as capability-gated placeholders; wire a provider to activate. `EMAIL` delivery from the notification pipeline is a documented hook (bind a template per event in your domain).
- **Object storage provider (S3/GCS)** — files are stored on local disk behind the `storage-key`/`resolveStoragePath` abstraction. Swap the read/write in `files.service.ts` for a provider; consider signed URLs.
- **Multi-tenancy / scopes** — the auth context is extensible to scopes, but no tenant isolation is built. Don't fake one.
- **Redis caching** — not wired. Add behind the existing service decorators if you need it.

## Remaining limitations

Real constraints of the current design:

- **Scheduler** — none is shipped. A single-instance in-process scheduler is **not** safe for horizontal scaling; if you add one, use leader election or a distributed job runner, or a DB-poll + advisory-lock design. Do not assume in-process timers are HA.
- **Rate limiting is per-instance (in-memory)** — behind multiple instances, limits are per-process. Use a shared store (e.g. Redis) for global limits at scale.
- **Per-request permission load** — permissions are read from the DB on each authenticated request (read-only). Fine for typical loads; add a short-TTL cache if it becomes hot.
- **Audit is best-effort** by default — for operations needing guaranteed audit atomicity, write the audit row inside the operation's transaction.
- **Email delivery is best-effort** and disabled by default — enable and configure SMTP per environment; delivery outcomes are logged, not queued/retried.
