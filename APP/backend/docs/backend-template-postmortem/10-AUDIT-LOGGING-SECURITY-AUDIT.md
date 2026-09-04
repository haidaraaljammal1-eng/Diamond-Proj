# 10 — Audit Log, Logging & Redaction Audit

Reviewed: `src/plugins/audit.ts`, `src/lib/security/redact.ts`, `src/config/logger.ts`,
`prisma/schema/audit.prisma`, `src/modules/audit/*`, `src/modules/audit-log/*`, and all 153 mutating
route handlers.

---

## 1. Audit architecture — `AUDIT_COMPLIANT`

`src/plugins/audit.ts` implements exactly the pattern `13-AUDIT-LOG-STANDARD.md` prescribes:

- `request.setAudit({ action, entityType, entityId, metadata, before, after })` **enriches** context;
  handlers never write `AuditLog` rows themselves.
- One row per mutating request, written on `onResponse` (`:31-68`).
- **Default-on:** `shouldAudit = Boolean(ctx?.action) || (isMutating && reply.statusCode < 400)`
  (`:34`). A `POST`/`PUT`/`PATCH`/`DELETE` that succeeds is audited **even if the handler said
  nothing**, falling back to `action = "${method} ${routeUrl}"`. This is the right default: forgetting
  `setAudit` degrades the record's *quality*, never its *existence*.
- Best-effort: a failed audit write logs a warning and never breaks the response (`:64-67`) —
  documented as a deliberate trade-off in `KNOWN-LIMITATIONS.md:37`.
- Request **bodies are never logged** — only handler-supplied metadata/before/after.

### Captured fields

| Field | Present | Note |
| --- | --- | --- |
| `actorUserId` | ✅ `request.auth?.id ?? null` | null for public actions |
| `action` | ✅ | falls back to `METHOD /route/url` |
| `entityType` / `entityId` | ✅ optional | |
| `metadata` | ✅ sanitized | always includes `status` |
| `before` / `after` | ✅ optional, sanitized | `Prisma.JsonNull` when absent |
| `requestId` | ✅ `request.id` (uuid from `genReqId`) | correlates audit ↔ logs |
| `ip` | ✅ **masked** — last IPv4 octet zeroed (`redact.ts:52-57`) | |
| `userAgent` | ✅ raw | |
| `createdAt` | ✅ | |

Indexes on `actorUserId`, `action`, `(entityType, entityId)`, `createdAt` — the query shapes an audit
UI needs. ✅

## 2. Sanitization — `AUDIT_COMPLIANT`, no `SENSITIVE_DATA_IN_AUDIT`

`src/lib/security/redact.ts`:

```
SECRET_KEY = /(pass|password|passwordhash|token|tokenhash|secret|otp|totp|two[_-]?factor|
              recovery[_-]?code|backup[_-]?code|challenge|authorization|cookie|api[_-]?key|
              private[_-]?key|refresh|access[_-]?token|session)/i     → "[REDACTED]"
PII_KEY    = /(email|phone|mobile|national|ssn|iban|card)/i           → "ab***yz"
MAX_DEPTH 6 | MAX_ARRAY 50 | MAX_STRING 1000
```

Applied to `metadata`, `before` and `after` on every write. Bounded depth/breadth/length prevents an
audit row from becoming an exfiltration channel or a storage bomb. Unknown types (functions, symbols)
fall through to `[REDACTED]` rather than being stringified.

**Weakness (shared with the pino config): key-based, not value-based.** A secret that arrives under a
non-matching key — `{ link: "https://…/reset-password?token=abc" }`, `{ url: … }`, `{ note: "my
password is …" }` — passes through untouched. The password-reset log line at `auth.service.ts:215`
is a live instance of exactly this shape (§5).

## 3. Coverage — which sensitive operations are audited

| Metric | Value |
| --- | --- |
| Mutating endpoints (POST/PUT/PATCH/DELETE) | **153** |
| With an explicit `request.setAudit(...)` in the handler | **136 (89%)** |
| Without explicit `setAudit` (fall back to generic row) | 17 |

The 17 generic-row endpoints:

| Module | Endpoints | Assessment |
| --- | --- | --- |
| `auth` (4) | `POST /auth/refresh`, `/password-reset-request`, `/password-reset-confirm`, `/account-setup` | ⚠ **security-relevant.** Login *is* audited (`auth/routes/public/route.ts:40-43`) but a password reset, an account activation and a token rotation land as `POST /auth/password-reset-confirm` with `actorUserId: null` and no `entityId` — you cannot answer "whose password was reset?" from the audit log. |
| `notifications` (3) | `PATCH /read-all`, `PATCH /:id/read`, `PUT /preferences` | acceptable — low-sensitivity self-service |
| `public-surveys` (4) | resolve ×2, save answers, submit | acceptable — anonymous respondents; the survey response *is* the record |
| preview/validate (4) | `communication-template-preview`, `communication-template-versions/:id/validate`, `complaint-routing-rules/preview`, `survey-versions/:id/validate` | acceptable — read-only operations that happen to use POST |
| `reports` (1) | `POST /reports/:code/run` | ⚠ report execution over customer data is not attributed |
| `call-center` (1) | `PATCH /calls/:id/survey/answers` | ⚠ writes survey answers on a customer's behalf, unattributed beyond the generic row |

Explicitly **well**-audited sensitive operations (spot-verified):

- exports — `complaints.export` with `{ format }` metadata (`complaints/routes/admin/route.ts:38`)
- attachment access — `complaint_attachments.accessed` with the attachment id (`:64`)
- file upload / delete — `files.upload` / `files.delete` (`files/routes/user/route.ts:38,84`)
- user role/status changes, settings writes, complaint transitions/assignments — all set `setAudit`

*Classification:* `AUDIT_METADATA_ONLY` for the 7 flagged endpoints (a row exists but carries no
actor/entity), `AUDIT_COMPLIANT` elsewhere. **`AUDIT_MISSING`: 0** — the default-on writer means no
successful mutation goes unrecorded.

## 4. Audit integrity

| Control | Status |
| --- | --- |
| Read API | `GET /audit` — `permissions: [AUDIT_READ]` (`audit/routes/admin/route.ts:19`) ✅ |
| Export API | `GET /audit-log/export` — permission-gated ✅ |
| Update/delete endpoints for `AuditLog` | **none exist** ✅ |
| DB-level append-only enforcement | ❌ none — no trigger, no revoked `UPDATE`/`DELETE` grant; the application user can rewrite history |
| Transactional coupling | ❌ by design (best-effort `onResponse`). `13-AUDIT-LOG-STANDARD.md §Transactional coupling` says to write inside the operation's transaction *when atomicity is required*; **no call site does** |
| Retention / archival policy | none defined |

The absence of an audit-mutation endpoint is good. The absence of any DB-level guarantee means the
audit log is "trustworthy against application bugs, not against a compromised application".

## 5. Logging & redaction

`src/config/logger.ts` redaction paths:

```
req.headers.authorization | req.headers.cookie | req.headers['x-refresh-token']
res.headers['set-cookie']
*.password | *.passwordHash | *.newPassword | *.currentPassword
*.token | *.tokenHash | *.refreshToken | *.accessToken | *.secret
*.twoFactorSecretEncrypted | *.twoFactorPendingSecretEncrypted
*.otpauthUri | *.manualEntryKey | *.recoveryCode | *.recoveryCodes | *.challengeToken
```

| Check | Result |
| --- | --- |
| Structured logs | ✅ pino, `genReqId: randomUUID` (`app.ts:23`) |
| Request id on every line | ✅ via `request.log` |
| Error code logged on error paths | ✅ `error-handler.ts` logs `{ code, statusCode }` at warn, `{ err }` at error |
| Duration | ✅ Fastify's default `res` serializer includes `responseTime` |
| `console.*` in `src/` | **2 occurrences total**, both in `src/config/env.ts` startup failure output (before the logger exists) — correct |
| ESLint guard | `no-console: ["warn", { allow: ["warn","error"] }]` (`eslint.config.mjs:12`) |
| Full request body logged anywhere | **no** |
| Uploaded file contents logged | **no** |
| Authorization / cookie headers | redacted ✅ |
| Refresh / access tokens | redacted by key ✅ |
| Password / passwordHash | redacted ✅ |
| OTP / TOTP / recovery codes / challenge token | redacted ✅ |

### The three redaction gaps

1. **`SECRET_LEAK_RISK` — reset token inside a URL string.**
   `src/modules/auth/auth.service.ts:214-216`:
   ```ts
   if (result.status === "SKIPPED" && env.NODE_ENV !== "production") {
     fastify.log.warn({ to: user.email, link }, "password reset link (email disabled)");
   }
   ```
   `link` = `${FRONTEND_URL}/reset-password?token=${raw}` — the **raw single-use reset token**, in a
   field named `link`, which no redaction path matches. Production-guarded, and the developer
   motivation (make the flow testable without SMTP) is legitimate. But anyone with staging/dev log
   access can take over any account, and `to: user.email` puts a plaintext address in the log stream
   next to it.
   *Verdict:* `PARTIAL_REDACTION`. *V2:* never log the secret — log a token id, or expose a dev-only
   `GET /__dev/last-reset-link` behind an explicit flag.

2. **Key-based redaction only.** Any secret arriving under an unmatched key name (`link`, `url`,
   `callbackUrl`, `body`, `payload`) is logged verbatim. Both `redact.ts` and the pino config share
   this limitation.

3. **PII in logs is unmanaged.** `redact.ts` masks PII *for audit rows*; the pino config does **not**
   mask `*.email` / `*.phone`. Several log lines carry addresses:
   `plugins/mailer.ts:41` `{ to, template }`, `:48` (template only — correctly reduced),
   `auth.service.ts:215` `{ to: user.email }`. Under a data-protection review this is the item most
   likely to be raised.

## 6. Verdicts

| Dimension | Verdict |
| --- | --- |
| Central audit hook | `AUDIT_COMPLIANT` |
| Coverage of mutations | `AUDIT_COMPLIANT` (153/153 produce a row; 136 enriched) |
| Auth-flow attribution | `AUDIT_METADATA_ONLY` — 4 auth endpoints, 1 report run, 1 call-center write |
| Sanitization | `AUDIT_COMPLIANT`, key-based |
| Sensitive data in audit | **none found** |
| Audit read authorization | ✅ permission-gated |
| Audit mutation protection | app-level ✅ / DB-level ❌ |
| Logging structure | `SAFE_REDACTED` |
| Secret redaction | `PARTIAL_REDACTION` — one live raw-token log line |
| PII in logs | `PARTIAL_REDACTION` — email addresses logged in several places |
