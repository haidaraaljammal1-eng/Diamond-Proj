# 08 — Idempotency & Duplicate-Side-Effect Audit

Reviewed: `src/lib/db/idempotency.ts`, `src/lib/db/outbox.ts`, every `runIdempotent` /
`dedupeKey` / `Idempotency-Key` call site, the complaint delivery outbox, the campaign delivery
pipeline, and every scheduler cycle.

---

## 1. The shared primitive

`src/lib/db/idempotency.ts:16-37`:

```ts
try   { await prisma.idempotencyKey.create({ data: { scope, key, expiresAt, resultRef } }); }
catch (err) { if (isUniqueViolation(err)) return { deduped: true }; throw err; }
const result = await effect();
return { deduped: false, result };
```

**Reserve-first, backed by `IdempotencyKey @@unique([scope, key])`** (`system.prisma:17`). This is the
correct shape and the docblock explicitly names the anti-pattern it replaces ("never *check then
send* — that races"). ✅

### Two real limitations of the primitive

1. **Poison keys.** If `effect()` throws, the reservation row is *not* removed. The operation can
   never be retried under that key — every subsequent attempt returns `{ deduped: true }` with
   `result: undefined`. `quick-send.service.ts` works around this by catching, writing a `FAILED`
   batch, and pointing `resultRef` at it (`:957-960`) — good, but that is 15 lines of compensation
   the caller had to invent. A caller that does *not* do this silently swallows the retry.
2. **`deduped: true` carries no result.** The caller gets no way to return the original outcome
   unless it separately reads `resultRef`. Again `quick-send` does this by hand.

*V2:* `runIdempotent` should (a) delete the reservation on failure unless the caller opts into
"terminal failure", and (b) return the stored `resultRef` on dedupe.

## 2. Adoption — 4 call sites for the whole system

| Site | Scope | Verdict |
| --- | --- | --- |
| `api/external-api.service.ts:109` | `api_survey_send`, key = caller-supplied idempotency key | `CREATE_FIRST_IDEMPOTENT` ✅ |
| `survey-quick-send/quick-send.service.ts:840` | `survey_quick_send` | `CREATE_FIRST_IDEMPOTENT` ✅ + documented rationale at `:778` |
| `plugins/notifications.ts:84` | `notify:in_app`, key = `${dedupeKeyPrefix}:${userId}` | `CREATE_FIRST_IDEMPOTENT` ✅ — **only when the caller passes `dedupeKeyPrefix`** |
| (`complaints.service.ts:305` calls `fastify.notify` — with or without a prefix depends on the event) | | |

**Four sites in a 44,000-line system with 153 mutating endpoints.** The primitive works; it simply is
not reached for.

## 3. Flow-by-flow classification

| Flow | Mechanism | Verdict |
| --- | --- | --- |
| **External API `POST /api/v1/surveys/send`** | `runIdempotent("api_survey_send", key)` | `CREATE_FIRST_IDEMPOTENT` |
| **External API `POST /api/v1/complaints`** | `Complaint @@unique([sourceType, sourceId])` | `CREATE_FIRST_IDEMPOTENT` (constraint-based) |
| **Quick send batch** | `runIdempotent` + compensating FAILED record + `resultRef` | `CREATE_FIRST_IDEMPOTENT` |
| **Manual complaint create** | route reads `idempotency-key` header and passes it through (`complaints/routes/admin/route.ts:76-80`) | `CREATE_FIRST_IDEMPOTENT` |
| **Campaign enrollment** | `SurveyInvitation @@unique([campaignId, purchaseExperienceId])` | `CREATE_FIRST_IDEMPOTENT` |
| **Campaign step delivery** | `MessageDelivery @@unique([invitationId, campaignStepId])` + lease claim | `CREATE_FIRST_IDEMPOTENT` |
| **Complaint notification email** | `ComplaintNotificationDelivery @@unique([complaintId, eventKey, dedupeSuffix, channel, recipientUserId])`, create-first + unique-violation swallow (`complaint-notifications.ts:80-96`) | `CREATE_FIRST_IDEMPOTENT` ✅ genuinely good |
| **Domain outbox** | `DomainOutboxEvent.dedupeKey @unique`, unique-violation swallowed (`outbox.ts:22-33`) | `CREATE_FIRST_IDEMPOTENT` |
| **Outbox consumption** | `updateMany` lease claim; consumer idempotent via `@@unique([sourceType,sourceId])` | at-least-once, safe |
| **Survey submission** | response status CAS + `alreadyCompleted` short-circuit + outbox dedupeKey | `CREATE_FIRST_IDEMPOTENT` |
| **Import rows** | `ImportJobRow @@unique([jobId,rowNumber])` + per-entity advisory locks | `CREATE_FIRST_IDEMPOTENT` |
| **Password reset / account setup token** | check `usedAt` then `update where {id}` | ❌ `CHECK_THEN_SEND_RISK` |
| **In-app notification (call-center unreachable)** | `findFirst` on `data.dedupeKey` JSON path → `create` | ❌ `CHECK_THEN_SEND_RISK` |
| **In-app notification (negative survey alert)** | same shape | ❌ `CHECK_THEN_SEND_RISK` |
| **SLA warning / breach notifications** | `notify(EVENT, id, c, "cyc"+n)` — a dedupe suffix *is* passed, but the writes around it are non-transactional (see `07 §3.1`) | `PARTIAL` |
| **Scheduler cycles generally** | overlap guard is an in-process boolean only | ⚠ `MISSING_IDEMPOTENCY` at the *cycle* level (individual effects are protected) |
| **Report schedule execution** | `reportSchedule.update` after the fact, no reservation | `MISSING_IDEMPOTENCY` — a crash mid-run can re-generate an artifact |
| **`fastify.mailer.send`** (account setup, password reset) | none | `NO_IDEMPOTENCY_NEEDED` at the primitive level (the *token* is single-use), but a retry storm would re-send mail |
| **Webhooks inbound** | none exist | n/a |

## 4. The two `CHECK_THEN_SEND_RISK` notification sites — full detail

```ts
// src/modules/call-center/call-center.service.ts:576-587
const dedupeKey = `call_center.customer_unreachable:${item.id}`;
const existing = await prisma.notification.findFirst({
  where: { userId: b.managerUserId, eventKey: "call_center.customer_unreachable",
           data: { path: ["dedupeKey"], equals: dedupeKey } },
});
if (existing) return;
await prisma.notification.create({ data: { userId: …, eventKey: …, data: { …, dedupeKey } } });
```

```ts
// src/modules/public-surveys/public-surveys.service.ts:497-503
const existing = await prisma.notification.findFirst({ where: { userId, eventKey,
  data: { path: ["dedupeKey"], equals: dedupeKey } } });
if (existing) continue;
await prisma.notification.create({ data: { userId, eventKey, title: …, body: …, data: metadata } });
```

Three defects in one pattern:

1. **Race.** No unique constraint exists on `Notification` for `(userId, eventKey, dedupeKey)`, so
   concurrent scheduler ticks or API replicas both insert. Duplicate user-visible notification.
2. **Dedupe key lives in a JSON blob.** `data: { path: ["dedupeKey"] }` is a JSONB containment query
   against an unindexed path — correctness aside, it is a sequential scan of `notifications` per
   recipient per event.
3. **`fastify.notify` already solves this.** `plugins/notifications.ts:83-91` wraps the in-app insert
   in `runIdempotent("notify:in_app", "${dedupeKeyPrefix}:${userId}")`, backed by a real unique
   constraint. The code re-implemented a worse version of a helper that was one decorator away.

**Why did this happen?** Because `fastify.notify.send()` only supports `{ eventKey, userIds, title,
body, data, dedupeKeyPrefix, channels }` — and both call sites wanted things it does not offer
(`public-surveys` needed permission-based audience resolution; `call-center` needed a branch-manager
lookup). Rather than resolve the audience *then* call `notify`, both resolved the audience and then
did the insert themselves. `C. STARTER_CAPABILITY_GAP` compounded by
`E. AUTOMATION_GAP` (no rule forbids `prisma.notification.create` outside the notifications module).

## 5. `NotificationDeliveryLog.dedupeKey` — a designed mechanism that never shipped

`notifications.prisma:69-84` declares:

```prisma
// `dedupeKey` gives create-first idempotency: a unique-violation means the effect already fired.
dedupeKey String? @unique
```

**No code writes it.** `plugins/notifications.ts:57-59` creates delivery-log rows with
`{ userId, eventKey, channel, status, reason, notificationId }` and no `dedupeKey`. The column is
permanently `NULL`, the unique index is decorative, and the comment describes a mechanism that was
replaced mid-design by the `IdempotencyKey` table without the schema being updated.

Nothing detects this: an always-null column with a unique index passes typecheck, lint, migration and
every test.

*V2:* `check:prisma` should flag `@unique` columns with zero writers in `src/`.

## 6. Duplicate-side-effect risk summary

| Side effect | Duplicate possible? | Guard |
| --- | --- | --- |
| Survey invitation email/SMS/WhatsApp | no | `MessageDelivery @@unique([invitationId, campaignStepId])` + lease |
| Complaint notification email | no | 5-column composite unique |
| Quick-send batch | no | `runIdempotent` |
| External API survey send | no | `runIdempotent` |
| Complaint created from external source | no | `@@unique([sourceType,sourceId])` |
| Complaint created from outbox event | no | same constraint |
| **In-app notification (2 paths)** | **yes** | none |
| Password reset email | yes (on retry storm) | none — but token is single-use |
| Report artifact generation | yes | none |
| SLA escalation | **yes** — and worse, *partial* (see `07 §3.1`) | none |

## 7. Answers

- **Where is idempotency missing?** In-app notifications from `call-center` and `public-surveys`;
  report-schedule execution; SLA escalation; scheduler cycle-level replay.
- **Reserve-first used?** Yes, where used at all — 4 sites, all correct.
- **Delivery log present?** Three of them (`NotificationDeliveryLog`, `MessageDelivery`,
  `ComplaintNotificationDelivery`) with overlapping semantics — see `06 §7`.
- **Retry safety?** Good in campaigns (attempt counts, backoff, stale-lease recovery at
  `complaint-notifications.ts:110-118`), absent in reports and SLA.

## 8. Verification limit

`tests/integration/campaign-create-idempotency.test.ts` and
`campaign-cross-campaign-duplicate-race.test.ts` exercise exactly these guarantees but **self-skip
without a database**. Idempotency here is reviewed as designed, not observed as working.
