# Audit Log Standard

## Principle

Audit is written by a single centralized writer (`src/plugins/audit.ts`). Handlers **enrich** context; they do not write `AuditLog` rows themselves.

```ts
request.setAudit({
  action: "users.update",
  entityType: "user",
  entityId: String(id),
  metadata: { changedFields: ["email"] },
  before, after, // optional
});
```

One row is written per successful mutating request (or any request explicitly given an `action`). `before`/`after` are optional — the schema supports them but they are not required for every operation.

## What is captured

`actorUserId, action, entityType, entityId, metadata, before, after, requestId, ip (masked), userAgent, createdAt`.

## Sanitization (mandatory)

All stored metadata/before/after pass through `sanitizeForAudit` (`src/lib/security/redact.ts`): secret-keyed values are removed, PII-keyed values are masked, IPs have the last octet masked, and depth/size are bounded. Request bodies are **not** logged. **Never** audit a password, token, secret, or authorization header.

## Transactional coupling

Audit is best-effort by default (an `onResponse` writer) and never breaks the response. When an operation genuinely requires audit atomicity, write the audit row inside the same transaction as the change rather than relying on the best-effort hook — do not sacrifice atomicity of the primary change for a log row.

## API

Read-only: `GET /audit` (permission `audit.read`), server-paginated, filterable by actor/action/entityType/date range. Audit logs are never editable or deletable through the API.
