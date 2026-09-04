# 06 — Prisma, DB Constraints & Data-Integrity Audit

Reviewed: 18 schema files (2,771 lines, 79 models), 28 migrations, every Prisma call site in
`src/`, `src/lib/db/*`, `src/lib/master-data/code.ts`, `src/lib/security/normalize.ts`.

**Overall: strong.** Prisma input safety is effectively perfect; constraint coverage is good with a
handful of `APP_ONLY_SHOULD_ADD_DB_CONSTRAINT` gaps concentrated in the notification paths.

---

## 1. Prisma input safety — `SECURE_PROVEN`

| Anti-pattern | Hits in `src/` |
| --- | --- |
| `data: request.body` | **0** |
| `...request.body` / `...req.body` | **0** |
| `data: body` / `...body` | **0** |
| `as any` (real, not in a comment) | **0** (1 total hit, inside a docblock at `surveys.service.ts:583`) |
| Unchecked `create` / `update` from a client payload | **0 found** |
| Dynamic `orderBy` without an allow-list | **0** — `parseSort(input, allowedFields, fallback)` (`lib/http/pagination.ts:20-31`) used by 22 modules |
| Dynamic `where` built from raw client keys | **0 found** — filters are explicit zod fields mapped by hand |
| `$queryRawUnsafe` / `$executeRawUnsafe` | 3 (all parameterized — below) |
| `$queryRaw` tagged template | 3 (all `Prisma.sql` tagged) |

Every mutation goes `zod-validated field → explicit object literal → Prisma`. This is the single
cleanest result in the whole audit, and it is a direct product of the type provider making the
validated shape ergonomic to destructure.

### The 6 raw-SQL sites — all safe, one naming trap

| Site | Verdict |
| --- | --- |
| `lib/db/advisory-lock.ts:30,41` — `$executeRawUnsafe("SELECT pg_advisory_xact_lock($1,$2)", a, b)` | ✅ parameterized; `Unsafe` is required because Prisma's tagged template cannot express this call shape |
| `call-center.service.ts:325` — `$queryRawUnsafe(…FOR UPDATE SKIP LOCKED…, ...params)` | ✅ user data flows through `$1`/`$2`; the only interpolated fragment (`branchClause`) is a **static string chosen by a boolean**, never client text |
| `health/routes/public/route.ts:39` — `$queryRaw\`SELECT 1\`` | ✅ |
| `report-runners.ts:444,780` — `$queryRaw(Prisma.sql\`…\`)` with `${from}`, `${to}`, `${eff.ids}` | ✅ `Prisma.sql` parameterizes interpolations |

**The trap for V2:** a naive `check:security` rule banning `$queryRawUnsafe` would produce three false
positives on genuinely-safe code, and the team would disable the rule. V2 must ship a thin
`rawQuery(sql, ...params)` / `advisoryLock()` wrapper in `lib/db/` and ban the Prisma primitives
*outside that file*, so the rule is enforceable without exceptions.

## 2. Constraint inventory

| Metric | Value |
| --- | --- |
| Models | 79 |
| Inline `@unique` | 81 |
| `@@unique` composite | 26 |
| `@@index` | 155 |
| `onDelete: Cascade` | 39 |
| `onDelete: SetNull` | 14 |
| `onDelete: Restrict` (implicit default) | remainder |
| Soft-delete columns (`deletedAt` / `isDeleted`) | **0** — the system uses `isActive` and never hard-deletes master data |

**Soft-delete uniqueness problem: does not exist here.** Because there is no soft delete, there is no
"unique index blocks re-creating a deleted row" trap. `master-data.prisma:11-13` states the rule
explicitly. Good design, correctly documented.

### Normalized-value uniqueness — `DB_CONSTRAINT_PRESENT`, exemplary

The rule from `CLAUDE.md` ("enforce uniqueness with a DB unique index *and* application validation,
on the normalized/canonical value") is implemented properly and even automated:

- `Branch.normalizedName @unique`, `VehicleModel.normalizedName @unique`,
  `Salesperson @@unique([branchId, normalizedName])`, `Department @@unique([branchId, normalizedName])`.
- `src/lib/db/prisma-extensions.ts` installs a Prisma client extension that derives `normalizedName`
  from `name` on **every** `create` / `update` / `upsert` / `createMany` for the three name-keyed
  models — so services, the importer, seeds and tests *cannot* drift from the unique key.
- The nullable-`normalizedName` + Postgres nulls-distinct interaction is reasoned about in comments
  (`master-data.prisma:57-60`, `:104-107`, `:127-131`).

This is the best pattern in the repository and should be lifted into V2 verbatim as the reference
implementation for "canonical key + DB constraint".

## 3. Constraint gaps

| # | Business rule | Current enforcement | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| 1 | "Only one in-app notification per (user, event, dedupeKey)" | **application `findFirst` then `create`** | `CONCURRENCY_RISK` | `call-center.service.ts:583-586`, `public-surveys.service.ts:499-501` |
| 2 | `NotificationDeliveryLog.dedupeKey` is `@unique` and documented as "create-first idempotency" | **never written by any code path** | `DB_CONSTRAINT_PRESENT` but **dead** | `plugins/notifications.ts:57-59` omits `dedupeKey`; grep: 0 writers |
| 3 | Single-use security token (`SecurityToken.usedAt`) | check-then-`update where {id}` | `CONCURRENCY_RISK` | `auth.service.ts:233-253` (see `03 §3`) |
| 4 | `Notification` has no uniqueness at all for dedupe | app-only, via a JSON-path query | `APP_ONLY_SHOULD_ADD_DB_CONSTRAINT` | `notifications.prisma:48-66` |
| 5 | Idempotency reservation | `IdempotencyKey @@unique([scope,key])` | `DB_CONSTRAINT_PRESENT` ✅ | `system.prisma:17` |
| 6 | Outbox event dedupe | `DomainOutboxEvent.dedupeKey @unique` | `DB_CONSTRAINT_PRESENT` ✅ | `outbox.prisma` |
| 7 | Complaint notification per (complaint,event,cycle,recipient,channel) | `@@unique([complaintId,eventKey,dedupeSuffix,channel,recipientUserId])` | `DB_CONSTRAINT_PRESENT` ✅ | `complaints.prisma:285` |
| 8 | Complaint source uniqueness | `@@unique([sourceType,sourceId])` | ✅ | `complaints.prisma:392` |
| 9 | One invitation per (campaign, purchase experience) | `@@unique([campaignId,purchaseExperienceId])` | ✅ | `distribution.prisma:172` |
| 10 | Quick-send batch recipient uniqueness | `@@unique([batchId,customerId])` **and** `@@unique([batchId,purchaseExperienceId])` | ✅ | `distribution.prisma:341-342` |
| 11 | Answer/option uniqueness | `@@unique([responseId,questionId])`, `@@unique([answerId,optionId])` | ✅ | `response.prisma:175,188` |
| 12 | Version numbering (survey / template / policy) | `@@unique([surveyId,versionNumber])`, `@@unique([templateId,versionNumber])`, `@@unique([policyId,versionNumber])` | ✅ — sequence races are constraint-protected | `survey.prisma:94`, `communication.prisma:74`, `response.prisma:227` |
| 13 | SLA cycle / closure numbering | `@@unique([complaintId,cycleNumber])`, `@@unique([complaintId,closureNumber])` | ✅ | `complaints.prisma:436,530` |
| 14 | Import row identity | `@@unique([jobId,rowNumber])` | ✅ | `import.prisma:84` |
| 15 | User↔department / user↔branch assignment | `@@unique([userId,departmentId])`, `@@unique([userId,branchId])` | ✅ | `auth.prisma:117,135` |
| 16 | `Setting.key` unique | ✅ | | `settings.prisma` |
| 17 | `Department.branchId` nullable "for legacy rows" but required by the service | `APP_ONLY_JUSTIFIED` — documented, immutable-after-create, and the composite unique tolerates nulls | | `master-data.prisma:118-141` |
| 18 | `Salesperson.branchId` nullable, same pattern | `APP_ONLY_JUSTIFIED` | | `master-data.prisma:163-172` |

**Gap #2 is the most interesting single finding in this document.** The schema author designed a
create-first dedupe key on `NotificationDeliveryLog`, wrote the comment explaining it, added the
unique index — and the plugin that writes those rows never populates it. The runtime instead
reserves a row in the *separate* `IdempotencyKey` table. Two idempotency mechanisms were designed;
one shipped; the other left a unique index on a permanently-`NULL` column. Nothing detected it,
because "unused column" is invisible to typecheck, lint and tests alike.

## 4. Cascade / FK behaviour review

| Pattern | Assessment |
| --- | --- |
| `User → Notification/NotificationPreference` `onDelete: Cascade` | correct — inbox rows are meaningless without the user |
| `Notification → NotificationDeliveryLog` `onDelete: SetNull` | correct — the delivery record is audit-grade and outlives the inbox row |
| `Region ← City` (default Restrict) | correct and documented (`master-data.prisma:33`) |
| `Branch.managerUserId onDelete: SetNull` | correct — deleting a user must not delete a branch |
| `VehicleModel ← Vehicle` no cascade | correct and documented ("historical vehicles keep referencing a deactivated model") |
| 39 `Cascade` edges total | **no dangerous cascade found** — all point from an owned child to its aggregate root |

No cascade path was found that could delete business history from a user or master-data deletion.

## 5. Nullability review

Nullable columns that read as suspicious were checked; all have an explicit in-schema rationale:

- `Branch.normalizedName?`, `VehicleModel.normalizedName?`, `Salesperson.normalizedName?`,
  `Department.normalizedName?` — nullable so legacy rows are distinct under Postgres nulls-distinct;
  every real creation path sets them via the client extension.
- `Department.branchId?`, `Salesperson.branchId?` — legacy compatibility, documented, immutable after
  creation.
- `Salesperson.userId? @unique` — a salesperson may exist in ERP without a login; nullable+unique is
  the correct modelling of an optional 1:1.

**No "nullable for no reason" column found in the reviewed set.**

## 6. Migration audit

| Check | Result |
| --- | --- |
| Migration count | 28 + `migration_lock.toml` |
| Ordering | timestamp-prefixed, monotonic (`20260716121139_init` … `20260721020000_add_numeric_rating_0_10`) |
| Naming | descriptive and domain-meaningful throughout |
| Fresh-database path | `init` → domain migrations → feature migrations; no out-of-order dependency observed |
| Destructive operations in migrations | **not verified** — migrations were read by name/listing only; SQL bodies were not audited line-by-line, and no migration was executed (task constraint) |
| Backfill migrations | present by name (`20260718120500_normalized_name_nullable`, `20260721001500_department_branch_scope`, `20260721010000_simplify_complaint_stages`) — nullability transitions were staged, which is the correct pattern |
| Rollback / forward strategy documentation | **absent** — no doc describes how to roll a migration forward in production |

### ⚠ The critical migration finding is not in `prisma/migrations/` — it is in `package.json`

```json
"db:deploy": "prisma migrate reset --force && prisma generate && prisma migrate deploy && prisma db seed"
```
— `package.json:24`

`prisma migrate reset --force` **drops and recreates the database**, without a confirmation prompt,
as the *first* step of a script named `db:deploy`. `README.md:51` documents it as
`npm run db:deploy   # prod: prisma migrate deploy`, which is not what the script does.

This is the highest-severity finding in the entire postmortem. It is a **P0**: one operator following
the README destroys production data. It is also a pure `E. AUTOMATION_GAP` + `D. DOCUMENTATION_GAP` —
nothing in the repo cross-checks a script against its documented behaviour.

*V2:* `db:deploy` = `prisma migrate deploy` only. Any reset lives in `db:reset:dev` and refuses to run
when `NODE_ENV=production` or when `DATABASE_URL` does not match a dev/test allow-list.

## 7. Source-of-truth matrix

| Concept | Source of truth | Derived / read models | Risk |
| --- | --- | --- | --- |
| User identity & status | `User` | `request.auth` (rebuilt per request from DB) | none |
| Authorization | `Permission` ← `RolePermission` ← `Role` ← `UserRole` | `auth.permissions` array | none — no cache, always fresh |
| Branch visibility scope | `UserBranchAssignment` (+ `*.view_all_branches` permission) | 5 local `resolveScope` copies | **drift risk** — see `05 §5` |
| Department membership | `UserDepartmentAssignment` | branch scope *derived* Branch→Department→User in some paths | ⚠ two derivations of "which branches" coexist |
| Survey definition | `Survey` → `SurveyVersion` (immutable, `@@unique([surveyId,versionNumber])`) | responses reference the **version**, not the survey | ✅ snapshot-correct |
| Survey response | `SurveyResponse` + `SurveyAnswer` | `SurveyResponseAnalytics`, dashboard, reports | ⚠ reports and dashboard compute independently (see `05` fan-out) |
| Complaint state | `Complaint.status` + `ComplaintTimelineEvent` | `ComplaintSlaCycle`, overview KPIs | ✅ |
| Complaint SLA | `ComplaintSlaCycle` (`@@unique([complaintId,cycleNumber])`) | — | ✅ historical cycles are rows, not recomputation |
| Message template | `MessageTemplate` → `MessageTemplateVersion` → per-language content | rendered messages | ✅ versioned |
| Delivery outcome | `MessageDelivery` / `ComplaintNotificationDelivery` | `NotificationDeliveryLog` (partial mirror) | ⚠ **two delivery ledgers** for overlapping concerns |
| Settings | `Setting` table, `env` for secrets | `fastify.settings.*`, `fastify.capabilities` | ⚠ capabilities are env-only and cannot see DB-configured integrations (see `11`) |
| Notification audience | resolved in **caller code**, per domain | — | ⚠ 3 different resolvers (`public-surveys`, `call-center`, `complaints`) |

**Two duplicate-status concepts found:** delivery outcome is tracked in `MessageDelivery`,
`ComplaintNotificationDelivery` *and* `NotificationDeliveryLog`, with partially overlapping status
vocabularies (`DELIVERED/FAILED/SKIPPED` vs the campaign `DeliveryReason` enum). Reports that ask
"how many notifications went out?" will get different answers depending on which table they read.

## 8. Historical-snapshot audit

| Entity | Snapshot verdict |
| --- | --- |
| `SurveyResponse` → `SurveyVersion` | `SNAPSHOT_COMPLIANT` — responses bind to an immutable version, never to the live survey |
| `SurveyAnswer` / `SurveyAnswerOption` | `SNAPSHOT_COMPLIANT` — answer rows persist the chosen option ids |
| `ComplaintSlaCycle` | `SNAPSHOT_COMPLIANT` — each cycle is a row with its own numbering |
| `ComplaintEscalation`, `ComplaintTimelineEvent` | `SNAPSHOT_COMPLIANT` — append-only event rows |
| `MessageTemplateVersion` + `MessageDelivery` | `SNAPSHOT_COMPLIANT` — deliveries reference the version that was sent |
| `ImportJobRow` (`@@unique([jobId,rowNumber])`) | `SNAPSHOT_COMPLIANT` — per-row outcome persisted |
| `AuditLog.before` / `.after` | `SNAPSHOT_COMPLIANT` |
| `ResponseClassificationPolicy` `@@unique([policyId,versionNumber])` | `SNAPSHOT_COMPLIANT` |
| **Classification result on `SurveyResponse.classificationCode`** | ⚠ `MUTABLE_HISTORY_RISK` — the code is stored on the response, but whether the *policy version* that produced it is pinned was not verifiable without executing the classification path; if the policy is re-evaluated, history changes |
| Report outputs (`ReportArtifact`) | `SNAPSHOT_COMPLIANT` — artifacts are stored files |
| Dashboard KPIs | `NO_SNAPSHOT_REQUIRED` — live aggregates by design |

## 9. Verification limit

No database was created, migrated or queried. Constraint *existence* is read from the schema files;
constraint *effectiveness* (that each unique index actually exists in a migrated database, and that
`prisma migrate diff` is clean against the schema) was **not executed**. `npm run typecheck` passed,
which confirms the generated client matches the schema, but that is not the same as confirming the
database matches the migrations.
