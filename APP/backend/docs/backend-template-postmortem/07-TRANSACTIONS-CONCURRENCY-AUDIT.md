# 07 — Transactions & Concurrency Audit

Reviewed: `src/lib/db/{transaction,advisory-lock,idempotency,outbox,prisma-error}.ts` and every
multi-write path in `src/modules/`. Multi-write regions were located programmatically (brace-matched
`withTransaction` / `$transaction` regions vs. write call sites), then each candidate was read.

**Overall: `TRANSACTION_COMPLIANT` for user-facing write paths; `TRANSACTION_MISSING` /
`PARTIAL_WRITE_RISK` in the background SLA engine.**

---

## 1. Adoption of the shared primitives

| Helper | Call sites | Assessment |
| --- | --- | --- |
| `withTransaction(prisma, fn)` | **60** | near-universal for user-initiated multi-step writes |
| `acquireAdvisoryLock(tx, ns, id)` | **20+** across `call-center`, `communication`, `complaints`, `imports`, `row-evaluate` | correctly used *inside* transactions in every observed case |
| `acquireAdvisoryLocks` (sorted, deadlock-avoiding) | defined, used by the importer | correct |
| `runIdempotent` | **4** | under-used — see `08` |
| `writeOutboxEvent` | used by `public-surveys` finalize | correct transactional-outbox usage |
| Raw `prisma.$transaction` bypassing the helper | **1** (`purchase-experiences.service.ts:227`) | functionally identical; a lint rule would catch it |

`src/lib/db/transaction.ts:16` even documents the intended sequence:
`validate → lock → re-read → update → related write → (audit) — all in one tx`. The observed code
follows it in the paths that use it.

## 2. Verified-correct transactional paths (`TRANSACTION_COMPLIANT`)

| Operation | Evidence |
| --- | --- |
| Password set via token (reset / setup) | `auth.service.ts:249-263` — token `usedAt`, user password+status, and *all* session revocations in one tx |
| User status change (suspend/activate) | `users.service.ts:335-349` — status + session revocation atomic |
| Admin password set | `users.service.ts:311-327` — password + status + session revocation atomic |
| **Survey submission** | `public-surveys.service.ts:250-262` → `finalizeCore` — answers upsert, response completion + scoring snapshot, invitation completion, **outbox event**, and text-analysis queue rows all in ONE transaction. Textbook transactional-outbox. |
| Survey partial save | `:209-212` → `patchAnswersCore` — same pattern |
| Call-center claim (auto) | `call-center.service.ts:316-343` — `FOR UPDATE SKIP LOCKED` select + status/assignment update inside one tx |
| Call-center claim (manual), status transitions | `:349-470` — advisory lock → re-read → validate → write, all in tx |
| Complaint transitions / assignment | `complaints.service.ts:675`, `:853` — advisory lock inside tx |
| Template version publish / rollback | `communication.service.ts:225,274,333,393` — advisory lock inside tx |
| Import row evaluation | `row-evaluate.ts:450-640` — per-entity advisory locks (`import_customer`, `import_vehicle_ext`, `import_vehicle_vin`, `import_sale`, `master_model_code`, `master_model_name`, `master_branch_code`) inside tx |
| Complaint notification delivery claim | `complaint-notifications.ts:163` — advisory lock inside tx |

The survey-submission path in particular is the best transactional code in the repository and should
be the V2 reference implementation for "state change + durable event".

## 3. `TRANSACTION_MISSING` / `PARTIAL_WRITE_RISK`

### 3.1 SLA evaluation and auto-escalation — the main finding

`src/modules/complaints/complaints.service.ts:1061-1109`.

`autoEscalate` performs three related writes as three independent statements:

```ts
await prisma.complaint.update({ … isEscalated: true, escalationLevel: level, escalatedAt … });   // L1065
await prisma.complaintEscalation.create({ … level, reason: trigger … });                          // L1066
await prisma.complaintTimelineEvent.create({ … type: "ESCALATED" … });                            // L1067
await notify(EVENTS.ESCALATED, …);                                                                // L1068
```

`evaluateSla` (`:1071-1109`) does the same across a `take: 500` loop — per cycle it may issue
`complaintSlaCycle.update` + `complaintTimelineEvent.create` (warning), then the same pair again
(first-response breach), then again (resolution breach), then `autoEscalate`, then
`complaint.update({ isLate: true })`, each outside any transaction, with `notify(...)` interleaved.

**Failure mode (concrete):** the process is restarted (or the DB connection drops) between L1065 and
L1066. The complaint is now permanently marked `isEscalated: true, escalationLevel: 2` with **no
`ComplaintEscalation` row** and **no timeline event**. The escalation history — which the UI, the
reports and the audit trail all read — is silently wrong, and no retry can repair it because the
guard `c.escalationLevel + 1` has already advanced.

Equally: a cycle can be stamped `resolutionBreachedAt` with no `SLA_BREACHED` timeline event, so the
complaint is late in the data but shows no breach in its timeline.

| Attribute | Value |
| --- | --- |
| Classification | `TRANSACTION_MISSING` + `PARTIAL_WRITE_RISK` + `EXTERNAL_EFFECT_INSIDE_LOOP` |
| Spread | 1 file, 2 functions, ~8 write sites |
| Impact | silent history corruption in the complaint domain; unrepairable by retry |
| Likely cause | this is *background* code — written against a scheduler tick, not a request, where the "multi-step write ⇒ `withTransaction`" habit was less present |
| Agent / starter / docs / automation? | **automation** — the rule is written in `CLAUDE.md`, `AGENTS.md:12` and `15-TRANSACTIONS…`; nothing checks it |
| V2 fix | wrap each per-cycle evaluation in `withTransaction` with an advisory lock on the complaint id; move `notify` outside the tx (or to the outbox) |

### 3.2 `consumeOutbox` — lease pattern without a transaction

`complaints.service.ts:1038-1054` claims outbox rows with `updateMany` then updates them
individually. The `updateMany`-based claim is itself atomic (good), but the subsequent
`PROCESSED` / `FAILED` marking is not paired with the effect in a transaction, so a crash after the
effect but before the mark causes a re-delivery. That is *acceptable* for an at-least-once outbox
**provided** every consumer is idempotent; the complaint-creation consumer uses
`@@unique([sourceType, sourceId])` (`complaints.prisma:392`), so it is. `TRANSACTION_TOO_BROAD` is
not the issue; this is a documented-by-design at-least-once path. **No action required**, but it
should be *stated* as at-least-once rather than left to be inferred.

### 3.3 `report-exec.service.ts:318-325`

`reportArtifact.update` then `reportSchedule.update` (×2) outside a transaction. Impact is low —
worst case a schedule's `lastRunAt` disagrees with the artifact's state and the next tick re-runs the
report. `TRANSACTION_MISSING`, low severity.

## 4. `EXTERNAL_EFFECT_INSIDE_TRANSACTION` — checked, and clean

This is the failure mode that most often destroys a Postgres deployment (a provider timeout holding a
row lock for 30 s). It was specifically hunted for.

**Result: no provider call was found inside a `withTransaction` block.** More than that, the code
*documents* the avoidance:

`quick-send.service.ts:914-918`:
> "Neither call happens inside a transaction, so no provider round-trip is ever held open against a
> DB lock."

`campaigns.service.ts` `processDelivery` likewise claims a delivery row, releases, calls the
provider, then records the outcome.

This is a genuine strength and evidence the team understood the constraint.

### The deliberate non-transactional saga: `quick-send.create`

`quick-send.service.ts:840-965` is intentionally **not** one transaction:

```
runIdempotent(scope: "survey_quick_send", key) →
  create batch (VALIDATING) → create campaign → link → schedule|sendNow (provider I/O) →
  read back invitations (source of truth) → createMany recipients → roll up status →
  idempotencyKey.resultRef = batchId
catch → batch.status = FAILED ; idempotencyKey.resultRef = batchId
```

Classification: `CUSTOM_PATTERN_JUSTIFIED`. It has a reservation, a compensating action, a durable
failure record, and a replayable result reference. It is a hand-rolled saga — correct, but written
from scratch because the starter offers no saga/compensation primitive. `C. STARTER_CAPABILITY_GAP`.

## 5. Concurrency audit

| Concurrency-sensitive operation | Protection | Verdict |
| --- | --- | --- |
| Refresh-token rotation | conditional `updateMany` + `count === 0` → family revoke | ✅ `CREATE_FIRST`-equivalent, correct |
| 2FA challenge consumption | `updateMany where { id, usedAt: null }` + `count` | ✅ atomic |
| 2FA recovery-code consumption | `updateMany where { userId, codeHash, usedAt: null }` + `count === 1` | ✅ atomic |
| **Security token (reset/setup) consumption** | `findUnique` → check `usedAt` → `update where { id }` | ❌ **check-then-write race** (`auth.service.ts:233-253`) |
| Call-center queue claim | `FOR UPDATE SKIP LOCKED` inside tx | ✅ best-in-class |
| Call-center item state transitions | advisory lock + re-read inside tx | ✅ |
| Complaint transitions | advisory lock + re-read + revision check | ✅ |
| Complaint routing rules / SLA policies / notification settings | revision-based optimistic concurrency | ✅ |
| Template publish / version rollback | advisory lock | ✅ |
| Import de-duplication (customer / vehicle / sale / master data) | advisory lock per natural key **plus** DB unique constraints | ✅ belt and braces |
| Campaign enrollment | `@@unique([campaignId, purchaseExperienceId])` | ✅ constraint-protected |
| Quick-send batch recipients | `@@unique([batchId,customerId])`, `@@unique([batchId,purchaseExperienceId])` | ✅ |
| Sequence numbering (survey/template/policy versions, SLA cycles, closures) | composite `@@unique([parentId, number])` | ✅ races fail loudly rather than duplicating |
| **In-app notification dedupe** (`call-center`, `public-surveys`) | `findFirst` on a JSON path → `create` | ❌ **check-then-write race, no DB constraint** |
| Settings update | plain `upsert` on unique `key` | ✅ constraint-protected; last-write-wins by design |
| Outbox event write | `dedupeKey @unique` + unique-violation swallow | ✅ |
| Idempotency reservation | `IdempotencyKey @@unique([scope,key])`, create-first | ✅ |
| Scheduler tick | in-process boolean `running` guard only | ⚠ see `11 §Scheduler` |

### The two genuine check-then-write races

```ts
// call-center.service.ts:583-586  — and the same shape at public-surveys.service.ts:499-501
const existing = await prisma.notification.findFirst({
  where: { userId, eventKey, data: { path: ["dedupeKey"], equals: dedupeKey } },
});
if (existing) return;
await prisma.notification.create({ … });
```

`Notification` has **no** unique constraint that could catch the loser of this race, so two
concurrent scheduler ticks (or two API replicas) both see "no existing row" and both insert. The
result is a duplicate in-app notification — user-visible, and exactly what `runIdempotent` exists to
prevent. Both call sites are also *notification-pipeline bypasses* (see `09`), so the fix is the same
fix: route them through `fastify.notify` with a `dedupeKeyPrefix`.

## 6. Optimistic concurrency audit

| Verdict | Where |
| --- | --- |
| `WHERE_REQUIRED_PRESENT` | Complaints domain — a `revision` field is compared and `RESOURCE_MODIFIED` is thrown with `expected` / `currentRevision` in the error context: `complaints.errors.ts:59` (complaint), `:91` (routing rule), `:97` (SLA policy), `:102` (notification setting) |
| `NOT_NEEDED` | master-data CRUD (regions, cities, branches, vehicles, …) — low-contention reference data, last-write-wins is acceptable and reversible |
| `WHERE_REQUIRED_MISSING` | **Settings** (`Setting.value` upsert, no revision) — two admins editing the same setting silently overwrite each other, including channel-gating settings that change delivery behaviour |
| `WHERE_REQUIRED_MISSING` | **Users** (roles/branch/department assignment) — no revision; two admins editing one user's roles concurrently lose one edit with no signal |
| `WHERE_REQUIRED_MISSING` | **Surveys / survey versions** — draft editing is multi-field and multi-session; no revision check observed |

The `RESOURCE_MODIFIED` code, the `AppError.conflict`-style constructor (`app-error.ts:83`) and the
error envelope's `context.{expected,currentRevision}` fields are all in place — the mechanism exists
and is proven in `complaints`. It simply was not applied anywhere else, because nothing prompts a
developer to ask "does this entity need a revision?".

*V2:* make `revision Int @default(0)` part of the module generator's default model, and have
`check:architecture` warn when an `update` on a model that *has* a `revision` column does not include
it in the `where`.

## 7. Answers

- **Multi-step writes without a transaction:** 3 confirmed regions — `autoEscalate` (3 writes),
  `evaluateSla` (up to 8 writes per cycle × 500 cycles per tick), `report-exec.runReportCycle`
  (3 writes). Plus 1 deliberate, documented saga (`quick-send.create`).
- **Sensitive operations without concurrency protection:** 3 — security-token consumption, and the
  two in-app notification dedupe races.
- **External effect inside a transaction:** 0.
- **Transaction too broad:** 0 observed.
- **Advisory-lock usage:** correct in 100% of observed sites (always inside a transaction, always
  followed by a re-read).

## 8. Verification limit

None of the above was executed. `tests/integration/` contains suites named
`campaign-cross-campaign-duplicate-race.test.ts`, `campaign-rolling-concurrency.test.ts` and
`campaign-create-idempotency.test.ts` — precisely the right tests — but all self-skip without
`RUN_INTEGRATION=true` and a database. **The concurrency claims in this document are derived from
reading code, not from observing races.**
