# 16 — Automated Guards Proposal

Splits every finding into what a machine can decide and what needs a human. Each guard names the
finding it would have caught.

---

## Part A — `AUTOMATICALLY_ENFORCEABLE`

### A.1 `check:routes`

Source: AST scan of `src/modules/**/routes/**/route.ts` + the exported OpenAPI document.

| Rule | Catches | Evidence today |
| --- | --- | --- |
| Every route declares an explicit `access` classification | latent "forgot the permission" | 14 `AUTH_ONLY` routes indistinguishable from mistakes |
| No `app.<method>` outside `src/modules/**/routes/<level>/` | root-instance escape hatch | `src/app.ts:48` (E-11) |
| Every `public` route carries a written `reason` | accidental public surface | 16 public routes, all fine today, none justified in metadata |
| Public / upload / export routes must declare a rate limit | `MISSING_ON_SENSITIVE_ENDPOINT` | 3 survey-session routes + 5 exports + `POST /files` (`03 §6`) |
| Every permission string resolves to a registered `PermissionKey` | unregistered keys | 2 dynamic-permission sites (`02 §5`) |
| Route file contains no `prisma.` / `withTransaction` / `acquireAdvisoryLock` | business logic in routes | 2 hits today (`05 §1`) |

### A.2 `check:openapi`

| Rule | Catches |
| --- | --- |
| `components.schemas.length > 0` | E-7 — the 6 MB fully-inlined document |
| document size < budget (e.g. 2 MB) | E-7 |
| every operation has a 2xx response **or** an explicit `binaryResponse()` marker | E-8 — 9 undocumented streams |
| every operation includes the shared error responses | the same 9 |
| no duplicate `operationId` | regression guard |
| re-exporting the spec produces no diff vs the committed file | spec/code drift |

### A.3 `check:security` (ESLint `no-restricted-syntax` + a script)

| Rule | Catches | Evidence |
| --- | --- | --- |
| no `data: request.body`, no `...request.body` into Prisma | unsafe input | 0 today — **keep it at 0** |
| `$queryRawUnsafe` / `$executeRawUnsafe` only inside `src/lib/db/` | SQL injection surface | 3 safe uses today; a wrapper makes the rule exception-free (`06 §1`) |
| `nodemailer` imported only in `src/lib/mail/` | provider bypass | 2 import sites today, both legitimate — pin them |
| `prisma.notification.create` only inside `modules/notifications` | E-4, A-2 | 2 bypasses (`09 §1`) |
| `prisma.auditLog.create` only inside `plugins/audit.ts` | audit bypass | 0 today |
| password comparison only via `verifyPassword` | plaintext compare | 0 today |
| no hardcoded secret-looking literals | committed secrets | 0 today |
| no `package.json` script containing `migrate reset` outside `db:reset:dev` | **E-1 (P0)** | `package.json:24` |
| demo/seed entry must be opt-**in** and production-guarded | **E-2 (P0)** | `prisma/seed.ts:26-35` |
| log-object keys matching `link|url|callbackUrl` may not carry token-shaped values | E-13 | `auth.service.ts:215` |
| upload/download routes must pass an ownership resolver | **E-3 (P0)** | `files.service.ts:86` |

### A.4 `check:architecture`

| Rule | Catches |
| --- | --- |
| zero module dependency cycles | E-9 — 5 cycles today |
| layered import allow-list (`core → shared → domain`; domain↔domain only through `contracts/`) | uncontrolled fan-in (`survey-campaigns` 10, `communication` 8) |
| no module with routes but no service **and** > 1 endpoint | route-shell proliferation (18 modules) |
| collect `@debt(reason, owner, issue)` annotations into a report | turns honest in-code debt notes into backlog items (`branch-scope.ts:20-26`) |
| no duplicate implementation of a registered shared pattern (name/shape heuristic, warn-level) | E-12 — 5 `resolveScope` copies |

### A.5 `check:prisma`

| Rule | Catches |
| --- | --- |
| every `@unique` / `@@unique` column has ≥1 writer in `src/` | **E-10** — `NotificationDeliveryLog.dedupeKey` |
| every model listed as concurrency-sensitive has a `revision` column | D-7 |
| an `update` on a revisioned model includes `revision` in its `where` | lost updates (settings, users, surveys) |
| `prisma migrate diff` is empty (schema ⇄ migrations in sync) | drift |
| every model has `@@map` and every scoped model has an index on its scope column | performance/regression |

### A.6 `check:permissions`

| Rule | Catches |
| --- | --- |
| every registered key is used by ≥1 route or service | dead permissions |
| every route permission is registered | typos |
| naming matches `entity.action` with a declared exception list | the 6 three-segment keys (`02 §5`) |

### A.7 `check:docs`

| Rule | Catches |
| --- | --- |
| every "not shipped" / "not included" claim in `KNOWN-LIMITATIONS.md` has no matching implementation in `src/` | **D-1, D-2** — scheduler and 2FA both shipped |
| `README.md` script descriptions match `package.json` | **D-3** — `db:deploy` documented as the opposite of what it does |
| every file referenced by `docs/engineering-standards/00-README.md` exists | **D-4** — 9 missing files |
| every pattern in the registry names an existing reference implementation | rot |

### A.8 `verify` and CI

```jsonc
"verify": "npm run typecheck && npm run lint && npm run check:routes && npm run check:openapi && npm run check:security && npm run check:architecture && npm run check:prisma && npm run check:permissions && npm run check:docs && npm run build && npm test"
```

CI (currently **absent** — E-6) runs `verify` on every push and PR, with a disposable Postgres so
integration tests actually execute.

### A.9 Test-runner guard

```
npm test → fails if any suite reports "skipped" without ALLOW_SKIP=1
```

Catches **E-5**: 37 integration suites silently skipping, including every security assertion
(`12 §B`). This single guard would have converted this postmortem's four verification limits into
observed results.

---

## Part B — `REQUIRES_ARCHITECT_REVIEW`

These cannot be decided statically. V2 should surface them as **prompts in the module generator and
items on a PR checklist**, not as failing builds.

| Question | Why not automatable | Example from this audit |
| --- | --- | --- |
| Is a transaction required here? | requires knowing which writes must be all-or-nothing | `evaluateSla` (A-1) — a linter sees N writes, not one invariant |
| Is an advisory lock required? | depends on the contention model | call-center claim needed one; master-data CRUD did not |
| Is a snapshot required? | depends on whether history must survive master-data change | survey version pinning ✅; classification-policy pinning unverified (`06 §8`) |
| Should a notification failure roll back the business action? | product decision | correctly "no" everywhere here |
| Is a custom repository/service justified? | depends on the domain shape | `complaint-attachments` yes; `permissions` querying Prisma from a route no |
| Can this business rule be a DB constraint? | requires modelling judgement | in-app notification dedupe **can** and should be |
| Is this branch/ownership scope correct? | requires the authorization model | `files` download — a checker can require *a* resolver, not the *right* one |
| Is this the right audience for this event? | product decision | `resolveAudience` in complaints |
| Is this export's PII exposure acceptable? | legal/product | 5 export endpoints (`11 §D.2`) |
| Is this module a bounded context? | architectural judgement | the 18 route-shells |

**The guard for these:** `check:routes` and the generator can *force the question to be answered in
metadata* (`scope: "none" /* reason */`, `transactional: false /* reason */`) so that a reviewer sees
an explicit decision instead of an absence. Automation cannot decide; it can refuse to let the
decision be implicit.

---

## Part C — Rollout order

| Wave | Guards | Rationale |
| --- | --- | --- |
| **1 (day 1)** | `check:security` (destructive-script + seed rules), test-skip guard, CI running `verify` | catches both P0s and the false-green problem immediately |
| **2** | `check:routes`, `check:permissions` | protects the template's strongest asset from regression |
| **3** | `check:openapi`, `check:prisma` | contract and data-integrity quality |
| **4** | `check:architecture`, `check:docs` | structural and documentation rot |

Waves 1–2 are roughly two days of work and would have prevented, by count, 9 of the 14
`AUTOMATION_GAP` findings.
