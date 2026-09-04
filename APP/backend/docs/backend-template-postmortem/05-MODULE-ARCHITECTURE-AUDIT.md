# 05 — Module Architecture Audit

Reviewed: all 52 directories under `src/modules/`, their route files, services, schemas and
cross-module imports. Dependency graph and cycle detection were computed programmatically from
`from "src/modules/<x>"` import edges.

**Headline: the layering rule held; the *module boundary* rule did not exist.**

---

## 1. Layering compliance — excellent

The stated contract (`README.md:92`, `03-BACKEND-ARCHITECTURE.md §Route handler contract`) is:
*handler validates → delegates to a service → returns `{ data, meta? }`; business logic lives in the
service.*

| Measurement | Value |
| --- | --- |
| Route code | 5,838 lines / 307 endpoints ≈ **19 lines per endpoint** |
| Service + domain code | 30,719 lines |
| Ratio | **1 : 5.3** in favour of services |
| Direct `prisma.` calls inside a `route.ts` | **2** |
| `withTransaction` / `acquireAdvisoryLock` inside a `route.ts` | **0** |
| Route files importing `@prisma/client` | 0 |

The two Prisma calls in routes:

| Location | Code | Verdict |
| --- | --- | --- |
| `health/routes/public/route.ts:39` | `await fastify.prisma.$queryRaw\`SELECT 1\`` | acceptable — a liveness probe *is* the DB check; a service wrapper would add nothing |
| `permissions/routes/admin/route.ts:36` | `fastify.prisma.permission.findMany({…})` | **drift** — a read-only catalogue list, but it means the `permissions` module has no service layer at all and the query is invisible to anyone reading services |

That is a remarkably clean result for a 52-module system largely written by agents, and it is
directly attributable to the starter shipping `withTransaction`, `paginate`, `dataResponse` and a
service-per-module convention that was easy to copy.

## 2. Module classification

| Module | Routes | Svc | Schema | Classification | Note |
| --- | --- | --- | --- | --- | --- |
| `auth` | 15 | 2 | 2 | `FULLY_COMPLIANT` | reference-quality; 2FA split into own service |
| `users` | 11 | 1 | 1 | `FULLY_COMPLIANT` | transactional status changes, session revocation |
| `roles` | 6 | 1 | 1 | `FULLY_COMPLIANT` | |
| `settings` | 4 | 1 | 1 | `FULLY_COMPLIANT` | public/secret split enforced in service |
| `notifications` | 7 | 1 | 1 | `FULLY_COMPLIANT` | user isolation by `userId` filter |
| `files` | 3 | 1 | 1 | `COMPLIANT_WITH_NOTES` | layering fine; **no ownership check** (see `11`) |
| `regions` `cities` `branches` `departments` `salespeople` `vehicles` `vehicle-models` `customers` `purchase-experiences` | 4–8 | 1 | 1 | `FULLY_COMPLIANT` | textbook CRUD-over-service, `parseSort` allow-lists, `paginate` |
| `lookups` | 13 | 1 | 1 | `FULLY_COMPLIANT` | |
| `imports` | 12 | 1 | 1 | `COMPLIANT_WITH_NOTES` | 899+711 lines; advisory-locked row evaluation; large but coherent |
| `integrations` | 4 | 1 | 1 | `FULLY_COMPLIANT` | adapter registry + catalog, secrets encrypted |
| `communication` | 0 | 1 | 1 | `CUSTOM_PATTERN_JUSTIFIED` | **service-only module**: 10 files, zero routes; consumed by 5 route-shell modules |
| `complaints` | 16 | 3 | 1 | `COMPLIANT_WITH_NOTES` | 13 files, 3 services (main / admin / attachments) — correct decomposition, but `complaint-attachments.service.ts` duplicates `files` (see `11`) |
| `reports` | 24 | 6 | 1 | `ARCHITECTURE_DRIFT` | 22 files; also hosts `api-keys.service.ts` and `report-security.service.ts` consumed by three *other* modules |
| `survey-campaigns` | 16 | 1 | 1 | `COMPLIANT_WITH_NOTES` | 1,732-line service, 14 files; highest fan-in (10) |
| `survey-responses` | 8 | 1 | 1 | `ARCHITECTURE_DRIFT` | 1,342-line service; participates in 4 of the 5 cycles |
| `survey-quick-send` | 9 | 1 | 1 | `COMPLIANT_WITH_NOTES` | 1,328 lines but well-factored (own scope + schema + service) |
| `call-center` | 20 | 1 | 1 | `ARCHITECTURE_DRIFT` | direct `prisma.notification.create` bypass; local `resolveScope`; raw SQL claim loop |
| `public-surveys` | 5 | 1 | 1 | `ARCHITECTURE_DRIFT` | direct `prisma.notification.create` bypass; audience resolution inside the service |
| `dashboard` | 1 | 1 | 1 | `COMPLIANT_WITH_NOTES` | highest fan-out (5) — aggregates other modules' services |
| `api` | 7 | 1 | 1 | `CUSTOM_PATTERN_JUSTIFIED` | external access level; `apiScopes` enforced; correct new-level extension |
| `audit` | 1 | 1 | 1 | `FULLY_COMPLIANT` | |
| `health` `capabilities` `permissions` | 1–2 | 0 | 0 | `COMPLIANT_WITH_NOTES` | trivial by nature; `permissions` queries Prisma from the route |
| **18 route-shell modules** (below) | 1–9 | 0 | 0 | `ARCHITECTURE_DRIFT` | no service, no schema — pure URL-prefix wrappers |

### The 18 route-shell modules

`api-keys`, `audit-log`, `capabilities`, `communication-channels`, `communication-template-preview`,
`communication-templates`, `communication-template-variables`, `communication-template-versions`,
`complaint-routing-rules`, `complaint-sla-policies`, `health`, `permissions`, `report-targets`,
`security`, `survey-deliveries`, `survey-followups`, `survey-response-analytics`, `survey-versions`.

Each is a single `routes/admin/route.ts` importing another module's service:

```
audit-log            → reports/report-security.service      + reports/reports.schema
api-keys             → reports/api-keys.service             + reports/reports.schema
security             → reports/report-security.service      + reports/reports.schema
report-targets       → reports/report-targets.service       + reports/reports.schema
survey-versions      → surveys/surveys.service              + surveys/surveys.schema
survey-followups     → survey-responses/survey-responses.service
communication-*      → communication/communication.service  (5 modules)
complaint-routing-rules → complaints/complaint-admin.service
complaint-sla-policies  → complaints/…
```

**This is not developer sloppiness — it is forced by the framework.**
`src/plugins/autoload.ts:47-50` derives the URL prefix from the directory name. Therefore *the only
way to serve `/api-keys` and `/audit-log` and `/security` from the `reports` domain is to create
three sibling directories under `src/modules/`.* The convention conflates two independent concepts:

- **URL prefix** (a routing concern)
- **module / bounded context** (an architectural concern)

The agent had no other option that keeps the URL. Root cause: `C. STARTER_CAPABILITY_GAP` +
`F. ARCHITECTURE_AMBIGUITY`, not `A. AGENT_NON_COMPLIANCE`.

*Consequence:* "52 modules" overstates the system by ~35%. The real bounded contexts number about 34.
Anyone reading the tree assumes 52 domains and 52 owners.

*V2 fix:* let a module declare its own mount points —
`export const routes = [{ prefix: "/audit-log", level: "admin", handler }, …]` — or support a
`routes/admin/@audit-log/route.ts` prefix-override segment. Then `reports` owns its five URL
surfaces in one directory.

## 3. Service-layer reality check

Is the service layer real, or a pass-through?

| Module | Service lines | Verdict |
| --- | --- | --- |
| `survey-campaigns` | 1,732 | real (state machine, eligibility, audience reconciliation) |
| `survey-responses` | 1,342 | real |
| `survey-quick-send` | 1,328 | real |
| `complaints` | 1,198 (+ 2 more services) | real |
| `reports/report-runners` | 1,054 | real |
| `call-center` | 968 | real |
| `imports` | 899 + 711 | real |
| `surveys` | 878 | real |
| `users` | 481 | real |
| CRUD master-data modules | 150–470 | real (normalization, uniqueness, scope) |
| `permissions` | **0 — no service** | pass-through from route → Prisma |

**One pass-through out of 52.** No "anemic service" pattern found.

## 4. Cross-module coupling & cycles

Dependency edges (module → module) computed from imports:

**Top fan-in (most depended-on):** `survey-campaigns` 10, `communication` 8, `complaints` 7,
`survey-responses` 7, `reports` 6.
**Top fan-out:** `dashboard` 5, `survey-campaigns` 5, `survey-responses` 5, `api` 3.

### 5 module-level circular dependencies

```
1. survey-classification → survey-responses → survey-classification
2. survey-campaigns → survey-classification → survey-responses → survey-campaigns
3. complaints → survey-campaigns → survey-classification → survey-responses → complaints
4. survey-classification → survey-responses → call-center → survey-classification
5. survey-responses → call-center → public-surveys → survey-responses
```

These do not crash at runtime — every service is a factory function (`createXService(fastify)`)
resolved lazily at request time, and one site even uses a dynamic `await import()` to break load order
(`complaints/routes/admin/route.ts:27`). That dynamic import is itself the tell: someone hit a cycle
and worked around it locally rather than reporting a structural problem.

**Impact:** a change in `survey-responses` can propagate to `complaints`, `call-center`,
`survey-campaigns` and `survey-classification` with no compile-time signal; and any future attempt to
extract one of these into a package will fail.

*Root cause:* `E. AUTOMATION_GAP` — no `madge`/dependency-cruiser check, and no stated rule about
which modules may depend on which.
*V2:* `check:architecture` with a layered allow-list (`core → shared → domain`, domain-to-domain only
via an explicit `contracts/` interface) and a hard fail on cycles.

## 5. Duplicated utilities inside modules

| Duplicated concern | Shared implementation | Local re-implementations |
| --- | --- | --- |
| Branch scope resolution | `src/lib/scope/branch-scope.ts` | `call-center.service.ts:58`, `complaints.service.ts:73`, `reports.service.ts:34`, `survey-responses.service.ts:109`, `communication-timeline.service.ts:167` |
| File upload + storage + sniffing | `src/modules/files/files.service.ts` | `complaints/complaint-attachments.service.ts` (78 lines, and **better** — it checks scope) |
| Notification delivery | `fastify.notify` (`plugins/notifications.ts`) | `complaints/complaint-notifications.ts` (durable outbox), `call-center.service.ts:583`, `public-surveys.service.ts:501` |
| Email send interface | `fastify.mailer` | `survey-campaigns/providers.ts` (`ProviderRegistry`) |
| Page-meta envelope | `PageMetaSchema` / `listResponse` | `campaigns.schema.ts:244,280` |

`src/lib/scope/branch-scope.ts:20-26` **documents its own bypass in a code comment**, listing all five
duplicates and stating they were "left alone on purpose". That is honest engineering and terrible
architecture governance: an accepted-debt note in a source file is invisible to every process that
could act on it.

## 6. Shared services that exist but are under-used

| Shared component | Adoption |
| --- | --- |
| `withTransaction` | **60 call sites** — excellent |
| `acquireAdvisoryLock` / `acquireAdvisoryLocks` | 20+ sites across 6 modules — excellent |
| `paginate` / `PaginationQuerySchema` / `parseSort` | 24 / 24 / 22 modules — excellent |
| `AppError` + `ErrorCode` | universal |
| `runIdempotent` | **4 sites only** (`api`, `quick-send`, `notifications` ×1) |
| `writeOutboxEvent` (`lib/db/outbox.ts`) | present, plus a full `DomainOutboxEvent` model — but see `08`: the *complaint* path built its own delivery table instead |
| `resolveBranchScope` | 4 of 9 scope-using services |
| `fastify.mailer` | **2 call sites** (`auth`, `users`); all domain email goes through `providers.ts` |
| `fastify.notify` | **2 call sites** (`complaints`, `notifications`); two services bypass it |

The pattern is unmistakable: **helpers that solve a mechanical problem (transactions, pagination,
errors) were adopted near-universally; helpers that encode a policy (notifications, email,
idempotency, scope) were bypassed whenever the domain needed one thing they did not offer.**

That is the single most actionable architectural lesson in this postmortem. See `13`.

## 7. Module-pattern outliers

| Outlier | Description |
| --- | --- |
| `communication` | service-only module, no `routes/` at all — a legitimate shared-domain pattern, but nothing in the docs describes or names it |
| `api` | only user of the `external` access level; correctly extends the documented mechanism |
| `reports` | acts as a de-facto "platform" module hosting api-keys and security services for three unrelated URL surfaces |
| `complaints` | only module with 3 services + its own errors file + its own email renderer + its own notification pipeline — effectively a sub-application |
| `api-keys` | routes in `modules/api-keys/`, service in `modules/reports/` — the module boundary and the code boundary disagree |

## 8. Classification summary

| Verdict | Count | Modules |
| --- | --- | --- |
| `FULLY_COMPLIANT` | 18 | auth, users, roles, settings, notifications, audit, master-data ×9, lookups, integrations |
| `COMPLIANT_WITH_NOTES` | 10 | files, complaints, imports, survey-campaigns, survey-quick-send, dashboard, health, capabilities, permissions, purchase-experiences |
| `ARCHITECTURE_DRIFT` | 21 | reports, survey-responses, call-center, public-surveys + the 18 route-shells (minus health/capabilities/permissions counted above) |
| `MAJOR_TEMPLATE_BYPASS` | **0** | — |
| `CUSTOM_PATTERN_JUSTIFIED` | 3 | communication (service-only), api (external level), complaint-attachments (scope-checked upload) |

**No module bypassed the template's security or contract machinery.** All 21 drift entries are
structural: module granularity, cycles, and duplicated policy helpers — the things the template never
defined and no script ever checked.
