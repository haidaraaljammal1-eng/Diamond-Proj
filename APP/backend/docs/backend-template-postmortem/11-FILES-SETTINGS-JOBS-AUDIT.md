# 11 — Files, Settings/Capabilities, Scheduler & Import/Export Audit

---

## Part A — File upload & download security

Two independent implementations exist. **The product's is safer than the starter's.**

### A.1 Generic `files` module — `AUTHENTICATED_BUT_WEAK_VALIDATION` + `PATH_OR_SCOPE_RISK`

`src/modules/files/routes/user/route.ts` + `src/modules/files/files.service.ts`.

| Control | Status | Evidence |
| --- | --- | --- |
| Authentication | ✅ under `routes/user/` → `authenticatedHook` | |
| Permission | ✅ `FILES_UPLOAD` / `FILES_READ` / `FILES_DELETE` | `route.ts:33,58,79` |
| **Ownership / scope** | ❌ **NONE** | `files.service.ts:86-90`, `:92-98` |
| Size limit | ✅ `MAX_UPLOAD_SIZE` (5 MB default) at the multipart layer + `file.file.truncated` check → 413 | `plugins/multipart.ts:14`, `files.service.ts:44-50` |
| Declared MIME allow-list | ✅ `ALLOWED_UPLOAD_MIME` | `:36-41` |
| **Magic-byte verification** | ✅ content sniffed; declared type never trusted; stored mime = **detected**, not declared | `:52-59`, `lib/files/magic-bytes.ts` |
| Storage key | ✅ 128 bits of randomness + sanitized extension (`/^[a-z0-9]{1,8}$/`); original filename never used as a path | `lib/files/storage-key.ts:10-18` |
| Path traversal | ✅ `resolveStoragePath` re-resolves and asserts `resolved === join(baseDir, basename(key))` — a `../` key throws | `:21-27` |
| Filesystem path leakage | ✅ never returned; download streams by id | |
| Public URL | ✅ none — no static file server is mounted |
| Checksum | ✅ SHA-256 stored |
| Virus scanning | ❌ not present, not claimed |
| Orphan cleanup | ❌ none |
| Storage/DB consistency | ⚠ `writeFile` happens **before** `attachment.create` with no transaction or compensation (`:64-76`) — a failed insert leaves an orphan blob on disk forever |

**The ownership gap in full:**

```ts
// files.service.ts:86-90
async function openDownload(id: string) {
  const attachment = await loadOrThrow(id);          // findUnique by id — no user filter
  return { attachment, stream: createReadStream(resolveStoragePath(storageDir, attachment.storageKey)) };
}
// files.service.ts:92-98
async function remove(id: string) {
  const attachment = await loadOrThrow(id);          // same
  await prisma.attachment.delete({ where: { id } });
```

`Attachment` **has** an `uploadedById` column. It is never used as a filter. Therefore **any
authenticated user holding `files.read` can download any attachment in the system**, and any holder of
`files.delete` can delete any attachment — including another user's or another branch's.

Mitigations that reduce but do not remove the risk: ids are UUIDs (unguessable), and the permissions
are not granted to every role by default. But this is precisely the "verify scope/ownership after the
general permission" rule from `09-PERMISSIONS-AND-RBAC.md §Scope`, unimplemented **in the starter's
own reference implementation**.

*Classification:* **P0 HIGH**, `PATH_OR_SCOPE_RISK`.
*Root cause:* `G. LEGACY_PATTERN_LEAK` — the reference implementation itself is the weak one. The
README even advertises this module as the secure-files answer (`README.md:135-137`), listing
authentication, permissions, magic bytes and storage keys — and omitting ownership entirely.

### A.2 Complaint attachments — `SECURE_UPLOAD` (the better implementation)

`src/modules/complaints/complaint-attachments.service.ts` (78 lines) re-implements uploads and adds
everything the generic module lacks:

| Control | Implementation |
| --- | --- |
| Scope on upload | `await complaints.loadScoped(complaintId, viewer)` → 404 if out of branch scope (`:27`) |
| Scope on list | same (`:50`) |
| Scope on access-token mint | same (`:59`) |
| **Scope re-checked on stream** | same, *again*, after decrypting the token (`:73`) |
| Download authorization | short-lived (300 s) AES-256-GCM signed token carrying `{aid, cid, exp}`; no permanent URL is ever stored (`:60-64`) |
| Action linkage validation | `complaintAction.findFirst({ id: actionId, complaintId })` — cannot attach to another complaint's action (`:29-31`) |
| Same magic-byte + storage-key primitives | reuses `lib/files/*` ✅ |
| Timeline event | `ATTACHMENT_ADDED` recorded (`:44`) |
| Audit | `complaint_attachments.accessed` on stream (`routes/admin/route.ts:64`) |

This is `CUSTOM_PATTERN_JUSTIFIED` and should become the V2 reference. Its only gap is the same
write-file-then-insert ordering (`:38-42`).

### A.3 Cross-cutting

- **Two file implementations, ~60% duplicated.** `DUPLICATED_LOCAL_IMPLEMENTATION` — but the duplicate
  exists *because* the shared one was unusable for a scoped domain. `C. STARTER_CAPABILITY_GAP`.
- **`PUBLIC_UPLOAD`: 0.** No upload or download route is public. ✅
- `bodyLimit: env.MAX_UPLOAD_SIZE` is applied to *all* JSON bodies (`app.ts:25`) — raising the upload
  limit silently raises the JSON parse limit everywhere.
- Upload endpoints have **no dedicated rate limit** (global 100/60 s only).

---

## Part B — Settings & capabilities

### B.1 Settings

`src/plugins/settings.ts` + `src/modules/settings/*`. 3 admin routes (list, get, put) + 1 public.

| Check | Result |
| --- | --- |
| Typed accessors | ✅ `get` / `getNumber` / `getBoolean` / `getJson` with fallbacks (`plugins/settings.ts:9-14`) |
| Storage model | `Setting { key @unique, value String, type SettingType, scope?, isSecret, isPublic }` |
| Secret separation | ✅ `settings.service.ts:11` masks secret values as `"[SECRET]"` in the admin response; `:61` filters the public list to `{ isPublic: true, isSecret: false }` |
| Public endpoint leaks secrets | ❌ no |
| **Key validation** | ❌ none — any string is a valid key; no registry, no typo protection |
| **Cache / invalidation** | ❌ **none.** Every `settings.get(key)` is a fresh `findUnique`. `getBoolean` calls `get`, so a hot path that reads three settings issues three queries per request. |
| Environment overrides | ❌ not supported — env and settings are separate worlds |
| Defaults | per-call-site `fallback` arguments, not declared centrally |
| Audit on change | ✅ the `PUT` route is a mutating request → audited |
| Optimistic concurrency | ❌ none — see `07 §6` |
| **Everything typed as `String`** | ✅ deliberate: `value String` + `type SettingType` enum + typed accessors. Acceptable. |

**Business constants hardcoded instead of settings** — sampled:
`ACCESS_TTL_SECONDS = 300` (`complaint-attachments.service.ts:17`),
`PROCESSING_LEASE_MS = 5 * 60_000` (`complaint-notifications.ts:22`),
`LAST_SEEN_THROTTLE_MS` (`verify-token.ts:5`), `MAX_PAGE_SIZE = 100` (`pagination.ts:5`),
`DEFAULT_SLA_POLICIES` (complaints). Most are genuinely infrastructural and fine as constants;
`DEFAULT_SLA_POLICIES` is a business rule living in code with a DB override — a documented pattern,
but the split is not written down anywhere.

**Settings duplicated across modules:** report config is loaded via a module-local
`loadReportConfig(fastify)` (`reports/reports.config.ts`) rather than through `fastify.settings`, and
complaint channel gating lives in its own `ComplaintNotificationSetting` table rather than in
`Setting`. Three configuration mechanisms coexist: `env`, `Setting`, and per-domain settings tables.
`ARCHITECTURE_AMBIGUITY`.

### B.2 Capabilities — ⚠ dishonest in both directions

`src/plugins/capabilities.ts:24-29` is a static object built from env only:

```ts
{ email: env.EMAIL_ENABLED, files: true, push: false, sms: false }
```

But the actual email capability is `resolveEmailTransport()`, where **a DB-configured integration row
wins over ENV** (`plugins/mailer.ts:12-15`). Consequences:

1. Operator configures SMTP through the integrations admin screen, leaves `EMAIL_ENABLED=false` →
   `GET /capabilities` reports `email: false` (frontend hides the feature) **while email works**, and
   worse, `plugins/notifications.ts:130` gates the EMAIL channel on `fastify.capabilities.email`, so
   the notification pipeline **refuses a channel the system can deliver**.
2. WhatsApp/SMS adapters exist in the integrations catalog, but `sms`/`push` are hardcoded `false`, so
   a fully-configured WhatsApp provider is invisible to the capability map.

The starter's stated promise — "`GET /capabilities` exposes safe runtime flags so the frontend can
disable features **with a reason** instead of faking them" (`README.md:141`) — is violated.
*V2:* capabilities must be **computed by the same resolver the send path uses**, and cached with
explicit invalidation.

---

## Part C — Scheduler & background jobs

### C.1 What exists

`src/plugins/scheduler.ts` — an in-process `setInterval` (default `SCHEDULER_POLL_MS = 30_000`),
**enabled by default** (`SCHEDULER_ENABLED: envBool(true)`), started on `onListen` so it never runs
under `.inject()` tests. It calls `createDistributionRunner(fastify).runAllCycles()`
(`src/worker/distribution-runner.ts`), which runs four cycles — survey distribution, call-center,
complaints (SLA + outbox), reports — each independently try/caught so one failing domain never stops
the others.

A standalone worker also exists (`npm run worker:survey-distribution`) running the *same* runner.

### C.2 Classification: `SINGLE_INSTANCE_ONLY` (with strong per-effect protection)

| Property | Status |
| --- | --- |
| Overlap guard within one process | ✅ boolean `running` flag (`scheduler.ts:34,38-45`) |
| **Leader election** | ❌ none |
| **Distributed lock on the cycle** | ❌ none |
| Durable queue | ❌ none (DB polling + leases instead) |
| Per-effect idempotency | ✅ strong — advisory locks, status CAS, composite unique constraints, delivery leases with stale-lease recovery |
| Job failure logging | ✅ per cycle, structured |
| Graceful shutdown | ✅ `onClose` clears the interval; `timer.unref()` so the timer never keeps the process alive |
| Retry / backoff | ✅ inside the delivery pipelines (attempt counts, `availableAt`) |

The plugin's docblock claims (`:20-22`): *"Every cycle is idempotent … so even with N API replicas
overlapping runs never duplicate a send."*

**That claim is true for the delivery paths and false for at least three others**, all documented
elsewhere in this postmortem:
- SLA evaluation/escalation is non-transactional multi-write (`07 §3.1`) — two replicas can produce
  interleaved partial escalation history;
- the two in-app notification inserts are check-then-write with no unique constraint (`08 §4`) —
  two replicas produce duplicates;
- report-schedule execution has no reservation (`08 §3`) — two replicas can generate the same
  artifact twice.

**Per the task's rule — "do not treat an in-process scheduler as horizontally production-safe without
proof" — the correct verdict is `SINGLE_INSTANCE_ONLY`.** The deployment (single Docker service, per
the project's own deployment note) is consistent with that; the *documentation* is not.

### C.3 Documentation contradiction

`docs/engineering-standards/KNOWN-LIMITATIONS.md:34` states:

> **Scheduler** — none is shipped. A single-instance in-process scheduler is **not** safe for
> horizontal scaling…

A scheduler *is* shipped and is **on by default**. The same file (`:22`) says 2FA is "intentionally
not included"; 2FA is fully implemented. The standards pack was not updated as the product grew.
`D. DOCUMENTATION_GAP`.

---

## Part D — Import / Export

### D.1 Import (`src/modules/imports`, 12 endpoints, 899 + 711 lines)

| Check | Status |
| --- | --- |
| File validation | ✅ XLSX via `exceljs`; job model with row-level records |
| Row validation | ✅ `row-evaluate.ts` — per-row parse + validate + reference resolution |
| Partial failures | ✅ `ImportJobRow @@unique([jobId, rowNumber])`, per-row status |
| Duplicate handling | ✅ advisory locks per natural key (`import_customer`, `import_vehicle_ext`, `import_vehicle_vin`, `import_sale`, `master_model_code`, `master_model_name`, `master_branch_code`) **plus** DB unique constraints |
| Idempotency | ✅ constraint-based; re-running a job re-evaluates rows deterministically |
| Transaction granularity | ✅ per row/batch, not one giant transaction — correct choice |
| Progress / status | ✅ job status + counts |
| Audit | ✅ mutating endpoints audited |
| Permissions | ✅ 12/12 permission-gated |
| **Large-dataset memory** | ⚠ workbook parsing is in-memory (`exceljs`); bounded only by `MAX_UPLOAD_SIZE` (5 MB default). No streaming parser. |

Import is the best-engineered concurrency code in the repository.

### D.2 Export (5 endpoints)

`GET /complaints/export`, `/survey-responses/export`, `/audit-log/export`, `/call-center/queue/export`,
`/reports/:code/export`.

| Check | Status |
| --- | --- |
| Permission-gated | ✅ all 5 (`COMPLAINTS_EXPORT` etc.) |
| Branch/scope applied to exported rows | ✅ each passes the viewer into the service (`svc.exportXlsx(request.query, user)`) |
| Audited | ✅ `complaints.export` etc. with `{ format }` metadata |
| **PII exposure** | ⚠ exports contain customer names/phones/emails by design; no field-level redaction, no "export includes PII" acknowledgement, no separate permission for PII columns |
| Rate limit | ❌ global only — an expensive XLSX build has the same budget as a health check |
| Streaming | ⚠ `exportXlsx` returns a `Buffer` (`complaints/routes/admin/route.ts:44`) — the whole workbook is materialized in memory |
| Response schema | ❌ none (see `04 §2`) |
| Row cap | not verified — no `MAX_EXPORT_ROWS` constant found |

*V2:* an `exportEndpoint()` helper that bundles permission + scope + audit + a dedicated rate limit +
a row cap + streaming + `binaryResponse()` schema.
