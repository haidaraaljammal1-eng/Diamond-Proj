# 03 — Authentication, Session & Rate-Limiting Security Audit

Reviewed: `src/modules/auth/**`, `src/lib/security/**`, `src/services/roles/shared/**`,
`src/plugins/{jwt,rate-limit,cookies,helmet,cors}.ts`, `src/config/env.ts`,
`src/modules/reports/api-keys.service.ts`.

**Overall: `SECURE_WITH_LIMITATIONS`.** No `CRITICAL` or `HIGH_RISK` finding in the authentication
core. Five `SECURE_WITH_LIMITATIONS` items and one `MISSING_ON_SENSITIVE_ENDPOINT` rate-limit gap.

---

## 1. Passwords — `SECURE_PROVEN`

| Control | Implementation | Verdict |
| --- | --- | --- |
| Algorithm | argon2id, `memoryCost 19456` (19 MiB, OWASP baseline), `timeCost 2`, `parallelism 1` (`src/lib/security/password.ts:8-13`) | ✅ |
| Plaintext comparison | none — `verify(hashString, plain)` only (`password.ts:19-28`) | ✅ |
| Plaintext storage | none; `hashPassword` is the only write path | ✅ |
| `passwordHash` in responses | globally omitted at the Prisma client level; login explicitly re-enables it with `omit: { passwordHash: false }` for verification only (`auth.service.ts:68-71`) and never returns the user object | ✅ |
| Password in logs | pino redaction covers `*.password`, `*.passwordHash`, `*.newPassword`, `*.currentPassword` (`src/config/logger.ts:16-19`) | ✅ |
| Strength policy | **length ≥ 8 only** (`password.ts:30-40`) | ⚠ see below |

**⚠ `SECURE_WITH_LIMITATIONS` — password policy is length-only.** No complexity, no breached-password
check, no rejection of the email/username as the password. Eight characters is below current NIST
guidance for a system with no MFA requirement. It is *policy*, not a bug — but the starter offers no
knob: `MIN_PASSWORD_LENGTH` is a hard-coded constant, not env-configurable.
*V2:* `PASSWORD_MIN_LENGTH` env + pluggable `PasswordPolicy` with a zxcvbn-style or denylist hook.

## 2. Tokens & sessions — `SECURE_PROVEN` with two notes

### Access token
- `fastify.jwt.sign({ sub, sid, type: "access" }, { expiresIn: ACCESS_TOKEN_TTL })` — `auth.service.ts:33-38`.
- TTL default **900 s (15 min)**, env-validated positive integer (`env.ts:45`).
- Carries `sid` (session id) — good: enables per-session revocation reasoning later.
- Verified at `preValidation` (`verify-token.ts:27`) — **before** schema validation, so an anonymous
  caller with a malformed body gets 401, not a 422 that enumerates the request schema. This is a
  deliberate, documented improvement over the reference implementation.

⚠ **The `type: "access"` claim is written but never checked.** `verify-token.ts:28` destructures only
`{ sub, sid }`. Today the refresh token is opaque (not a JWT), so there is no confusable token to
substitute — the risk is latent, not live. But if V2 (or a future feature) ever signs a second JWT
kind with the same `JWT_ACCESS_SECRET`, this becomes a token-confusion vulnerability with no guard.
*Classification:* `SECURE_WITH_LIMITATIONS`. *V2:* assert `payload.type === "access"` and give each
token purpose its own secret or an audience claim.

### Refresh token — `SECURE_PROVEN`
`src/modules/auth/auth.service.ts:40-173`.

| Property | Implementation |
| --- | --- |
| Format | opaque, `randomBytes(32).toString("base64url")` (`tokens.ts:8-10`) — not a JWT |
| At rest | SHA-256 hash only (`refreshTokenHash`), unique-indexed | ✅ |
| TTL | 30 d default, env-configurable (`env.ts:46`) |
| Rotation | every use — old row revoked, new row created (`:141-164`) | ✅ |
| Rotation race | **atomic claim**: `updateMany({ where: { id, revokedAt: null } })` then `count === 0` → treat as reuse (`:141-151`) | ✅ genuinely correct |
| Reuse detection | presenting a revoked/expired token revokes the **entire `familyId`** (`:132-138`, `:145-150`) | ✅ |
| Revocation | `logout` scopes by `{ id: sessionId, userId }` (`:177-180`) — cannot revoke another user's session | ✅ |
| Password change | revokes **all** sessions inside the same transaction (`:259-262`) | ✅ |
| Suspension | `users.service.ts:341-347` revokes all sessions inside the status transaction | ✅ |

⚠ **`refresh()` does not re-check user status.** A user suspended *after* login can still call
`POST /auth/refresh` and receive a fresh access token — because suspension revokes the sessions that
existed at that moment, and `refresh` only validates the session row, not the user. In practice the
window is closed at the next request: `verify-token.ts:68-73` rejects `SUSPENDED` and `PENDING` on
every authenticated call. So the impact is "an attacker holding a stolen refresh token for a
just-suspended account gets a token that immediately fails everywhere" — annoying, not exploitable.
*Classification:* `SECURE_WITH_LIMITATIONS`. *V2:* join the user row in `refresh` and reject
non-`ACTIVE` status there.

### Session storage
Database-backed `AuthSession` rows (`prisma/schema/auth.prisma`), not cookies, not Redis. No
device/session-management API is exposed (no "list my sessions / revoke device"). Not a defect —
an unimplemented feature, and it is not claimed anywhere.

## 3. Password reset & account setup — `SECURE_WITH_LIMITATIONS`

`auth.service.ts:191-264`. Both flows share `setPasswordViaToken`.

| Control | Verdict |
| --- | --- |
| Token format | opaque 32-byte random, SHA-256 at rest (`SecurityToken.tokenHash`) | ✅ |
| Purpose/scope | `record.scope !== scope` → reject (`:238`) — `PASSWORD_RESET` cannot be used for `ACCOUNT_SETUP` | ✅ |
| Expiry | reset 3600 s, setup 86400 s, env-configurable (`env.ts:47-48`) | ✅ |
| Enumeration | `requestPasswordReset` performs identical work and returns an identical message whether or not the account exists (`:191-218`) | ✅ |
| Session invalidation | all sessions revoked in the same transaction as the password write | ✅ |
| Single use | `usedAt` is checked, then set — **but not atomically** | ⚠ |

⚠ **Check-then-write race on single-use tokens.** `:233-253`:

```ts
const record = await prisma.securityToken.findUnique({ where: { tokenHash } });
if (!record || record.usedAt || isExpired(...)) throw …;
…
await withTransaction(prisma, async (tx) => {
  await tx.securityToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  …
```

The `update` is keyed on `id` alone, not on `id AND usedAt IS NULL`. Two concurrent requests carrying
the same reset token both pass the check and both proceed. The **practical** impact is low — both set
a password and both revoke all sessions, and an attacker who already holds the token gains nothing by
racing themselves. But it is the exact `CHECK_THEN_SEND_RISK` pattern the project's own
`docs/engineering-standards/15-TRANSACTIONS-CONCURRENCY-IDEMPOTENCY.md` warns against, and it sits in
the starter's own reference implementation.
*Classification:* `SECURE_WITH_LIMITATIONS` / `CONCURRENCY_RISK`.
*V2 fix (one line):* `updateMany({ where: { id, usedAt: null }, … })` and treat `count === 0` as
`TOKEN_INVALID`.

⚠ **Reset link written to the log in non-production.** `auth.service.ts:214-216`:

```ts
if (result.status === "SKIPPED" && env.NODE_ENV !== "production") {
  fastify.log.warn({ to: user.email, link }, "password reset link (email disabled)");
}
```

The `link` contains the **raw reset token**, and `to` is a plaintext email address. The production
guard is real and correct, and the developer-experience motivation is sound. But `logger.ts`
redaction is path-based (`*.token`) and does not match a token embedded in a URL string, so this is a
deliberate hole in the redaction model. Anyone with dev/staging log access can reset any account.
*Classification:* `PARTIAL_REDACTION` (see `10`). *V2:* emit the token id and a `/dev/last-reset-link`
endpoint gated behind an explicit dev-only flag, never the secret itself into the log stream.

## 4. Two-factor authentication — `SECURE_PROVEN`

`src/modules/auth/two-factor.service.ts` (496 lines). Present and well built — note that
`docs/engineering-standards/KNOWN-LIMITATIONS.md:22` still claims 2FA is *intentionally not included*.

| Control | Implementation | Verdict |
| --- | --- | --- |
| TOTP secret at rest | AES-256-GCM via a **dedicated** `TWO_FACTOR_ENCRYPTION_KEY`, deliberately not derived from `COOKIE_SECRET` (`encryption.ts:11-19`, rationale in comment) | ✅ excellent |
| Password ≠ session | a correct password on a 2FA account issues **no session and no access token** — only a challenge (`auth.service.ts:92-94`) | ✅ |
| Challenge token | opaque, SHA-256 at rest, `scope: TWO_FACTOR_CHALLENGE`, TTL 300 s | ✅ |
| Attempt limiting | `attempts` incremented per try; challenge burned at `TWO_FACTOR_MAX_ATTEMPTS` (default 5) — `:400-414` | ✅ |
| Challenge single-use | `updateMany({ where: { id, usedAt: null } })` at `:423-424` — **atomic**, unlike the password-reset path | ✅ |
| Recovery codes | SHA-256 at rest; consumed by conditional `updateMany … usedAt: null` + `count === 1` (`:158-162`) | ✅ atomic |
| Enrolment | pending secret separate from active secret, TTL-bounded (`TWO_FACTOR_SETUP_TTL`) | ✅ |
| Redaction | `*.twoFactorSecretEncrypted`, `*.twoFactorPendingSecretEncrypted`, `*.otpauthUri`, `*.manualEntryKey`, `*.recoveryCode(s)`, `*.challengeToken` all redacted (`logger.ts:26-32`) | ✅ |

Note the inconsistency this reveals: the 2FA code consumes single-use tokens atomically; the
password-reset code, written earlier, does not. Same repository, two patterns for the same problem —
`ARCHITECTURE_AMBIGUITY`.

## 5. External API keys — `SECURE_WITH_LIMITATIONS`

`src/modules/reports/api-keys.service.ts`, `src/services/roles/shared/verify-api-key.ts`.

| Control | Verdict |
| --- | --- |
| Key format `cxk_<8hex>.<secret>`; only `secretHash = SHA-256(fullKey)` stored | ✅ |
| Lookup by `prefix`, then hash compare | ✅ |
| Revocation + expiry both enforced (`:74-75`) | ✅ |
| Scope enforcement is **ALL-of** and always-on (`enforce-api-scopes.ts:16-23`) | ✅ |
| Usage logged with safe metadata only (no payload/PII) (`verify-api-key.ts:44-49`) | ✅ |
| Hash comparison | `key.secretHash !== hashToken(rawKey)` — **non-constant-time string compare** | ⚠ |
| Rate limiter | in-process `Map`, never pruned | ⚠ |

⚠ `secretHash !== hashToken(rawKey)` (`api-keys.service.ts:73`) compares two hex digests with `!==`.
Timing analysis of a SHA-256 digest comparison is not a practical remote attack (the attacker cannot
choose the digest without already knowing the key), so this is **low** risk — but `timingSafeEqual`
is one import away and the codebase already imports `node:crypto` here.

⚠ The per-key limiter `buckets = new Map<number, …>` (`verify-api-key.ts:8`) is (a) per-process, so
useless behind more than one replica, and (b) never evicted — one entry per API key id, so bounded by
key count in practice, but it is unbounded by construction.

## 6. Brute-force & rate limiting

Global: `@fastify/rate-limit`, `global: true`, `RATE_LIMIT_GLOBAL_MAX` 100 / 60 s
(`src/plugins/rate-limit.ts:15-34`). The 429 is rendered through the **same error envelope** as
everything else, with a documented explanation of why `statusCode` must be present in
`errorResponseBuilder` (`:21-24`). Good.

Strict: `authRateLimit()` → `RATE_LIMIT_AUTH_MAX` 5 / 60 s.

| Endpoint class | Limit | Verdict |
| --- | --- | --- |
| `POST /auth/login` | 5/60 s | `ROUTE_SPECIFIC` ✅ |
| `POST /auth/refresh` | 5/60 s | ✅ |
| `POST /auth/password-reset-request` / `-confirm` | 5/60 s | ✅ |
| `POST /auth/account-setup` | 5/60 s | ✅ |
| `POST /auth/two-factor/verify`, `/recovery` | 5/60 s | ✅ |
| `POST /auth/two-factor/setup|verify|disable|recovery-codes` (user level) | 5/60 s | ✅ |
| `POST /public-surveys/{invitations,qr}/…/resolve` | 20/60 s | ✅ |
| **`GET|PATCH|POST /public-surveys/sessions/:sessionToken…`** | **global only (100/60 s)** | ⚠ `MISSING_ON_SENSITIVE_ENDPOINT` |
| File upload `POST /files` | global only | ⚠ |
| Report/export endpoints (`GET /reports/:code/export`, `/complaints/export`, `/survey-responses/export`, `/audit-log/export`, `/call-center/queue/export`) | global only | ⚠ expensive endpoints, no dedicated limit |
| External `/api/v1/*` | per-key limiter (config-driven) | ✅ separate mechanism |

**Structural weaknesses of the whole rate-limit design (all `MISCONFIGURED` at scale):**

1. **Per-IP only.** There is no per-account-identifier limiter. Five login attempts per minute *per
   IP* does not stop a distributed credential-stuffing run against one account, and it does let one
   NATed office exhaust the limit for everyone behind it.
2. **In-memory store.** Documented in `KNOWN-LIMITATIONS.md:35`, but the consequence is that the
   deployed configuration (single container per `SCHEDULER_ENABLED` design) is the *only* one where
   the limits mean what they say.
3. **`trustProxy: true` unconditionally** (`src/app.ts:26`). With a permissive proxy trust, `request.ip`
   is taken from `X-Forwarded-For`. If the service is ever reachable without a trusted proxy in
   front, an attacker forges the header and the per-IP limiter — and the audit log's `ip` column —
   become attacker-controlled. This should be an env-driven trust list, not a constant `true`.
4. **No successful/failed distinction.** `@fastify/rate-limit` counts all requests; a successful login
   consumes the same budget as a failed one, so an honest user with a flaky client can lock
   themselves out while an attacker's budget is identical.

## 7. Transport / header hygiene

- CORS: env allow-list, `*` rejected at startup in production (`env.ts:128-134`). ✅
- Helmet registered (`src/plugins/helmet.ts`). ✅
- Secrets: min 32 chars enforced; production startup fails if any secret still contains
  `replace-with` (`env.ts:113-127`). ✅ — a genuinely good guard rarely seen in starters.
- `bodyLimit: env.MAX_UPLOAD_SIZE` applied globally (`app.ts:25`) — couples JSON body size to upload
  size; raising the upload limit silently raises the JSON parse limit for every endpoint. Minor.

## 8. Verdict table

| Area | Verdict |
| --- | --- |
| Password hashing & storage | `SECURE_PROVEN` |
| Password policy | `SECURE_WITH_LIMITATIONS` (length-only, not configurable) |
| Access token | `SECURE_WITH_LIMITATIONS` (`type` claim unverified) |
| Refresh rotation / reuse detection / revocation | `SECURE_PROVEN` |
| Refresh + suspended user | `SECURE_WITH_LIMITATIONS` |
| Password reset / account setup | `SECURE_WITH_LIMITATIONS` (non-atomic single-use; token in dev logs) |
| 2FA (TOTP + recovery codes) | `SECURE_PROVEN` |
| API keys | `SECURE_WITH_LIMITATIONS` (non-constant-time compare, per-process limiter) |
| Enumeration protection | `SECURE_PROVEN` |
| Rate limiting | `SECURE_WITH_LIMITATIONS` / `MISSING_ON_SENSITIVE_ENDPOINT` for survey-session + export routes |
| Session/device management API | not implemented (not claimed) |

**No finding in this document is `CRITICAL` or `HIGH_RISK`.** The auth core is the best-executed part
of the system. Every item above is a hardening item for V2, not an incident.

## 9. Verification limit

All of the above is **static review**. `tests/integration/security.test.ts` contains the right
assertions — "password is stored hashed, never in plaintext", "refresh rotates the token and reuse of
the old token is rejected", "suspended user cannot log in" — but the suite self-skips without
`RUN_INTEGRATION=true` and a test database, neither of which was available under this task's
constraints. **These controls are read as correct, not observed as correct.**
