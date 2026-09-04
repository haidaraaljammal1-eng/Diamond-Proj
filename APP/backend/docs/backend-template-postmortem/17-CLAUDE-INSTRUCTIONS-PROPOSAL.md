# 17 — Proposed `CLAUDE.md` / `AGENTS.md` for Starter V2, Pattern Registry & Agent Workflow

---

## Part A — What the current instructions got right

`CLAUDE.md` (89 lines) and `AGENTS.md` (15 lines) are **good documents**. The evidence:

- 0 unprotected endpoints, 0 manual permission guards, 0 role-string authorization
- 0 unsafe body spreads, 0 real `as any`, 0 `try/catch`-to-build-an-error-response
- 60 `withTransaction` sites, universal `AppError` + stable codes, universal response envelope
- 89% of mutating endpoints enrich `setAudit` explicitly

Every one of those is a rule that `CLAUDE.md` states in a single imperative sentence with the helper
named. **Keep that style.** The failures were not caused by the instructions being too short.

## Part B — What is missing, and why

| Gap | Consequence | Finding |
| --- | --- | --- |
| No rule against writing `Notification` rows outside the notifications module | 2 pipeline bypasses | A-2, D-6 |
| No rule against building an SMTP transport outside the mail layer | acceptable today only by luck | D-6 |
| No rule that permission ≠ scope; ownership must be checked after the permission | `files` download reads any file | G-1 |
| No rule that a single-use token must be consumed atomically | 2 patterns in one repo | F-4 |
| No rule about which config mechanism to use | 3 coexist | F-3 |
| No rule about module boundaries / cycles | 5 cycles, 18 route-shells | E-9, C-6 |
| "Verify before done" lists commands but **not** that integration tests silently skip | false green | E-5 |
| No statement that the starter's own reference implementations may be wrong | `files` was copied as gospel | G-1..G-4 |

## Part C — Proposed `CLAUDE.md` for V2

```markdown
# CLAUDE.md

## What this is
Fastify 5 + TypeScript + Prisma 7 + PostgreSQL backend starter. Cross-cutting foundations only
(auth, RBAC, audit, notifications, messaging, files, settings, OpenAPI). No business domain —
build that in `apps/<product>/`.

## Before any non-trivial change
1. Read `docs/backend-patterns/BACKEND-PATTERN-REGISTRY.md` and find the pattern for your task.
2. Open the pattern's **reference implementation** and copy its shape.
3. If no pattern fits, say so explicitly and propose one — do not invent a local variant silently.

## Non-negotiable rules

### Authorization
- The backend is the authority. Frontend checks are UX only.
- Every route declares `access` explicitly: `public` | `authenticated` | `permission` | `apiKey` |
  `internal`. **Omission is a build failure.** There is no default.
- Permission answers "may this user do X at all?". **Scope answers "to which rows?".** They are
  separate and both are required. A route that reads or writes rows declares a `scope` resolver, or
  declares `scope: "none"` with a written reason.
- Never compare role strings to make an access decision.

### Secrets & tokens
- Passwords: `hashPassword` / `verifyPassword` (argon2id) only. `passwordHash` never leaves the server.
- Single-use tokens are consumed **atomically**: `updateMany({ where: { id, usedAt: null } })` and
  check `count`. Never `findUnique` → check → `update`. Use `consumeSingleUseToken()`.
- Never log a secret — including a secret embedded in a URL, a `link`, or a `callbackUrl`.

### Contract
- Every route has a zod schema: `summary`, `operationId`, `tags`, inputs, `response`.
- Binary/stream responses use `binaryResponse()` — never an absent response schema.
- Success is `{ data, meta? }`. Errors are thrown as `AppError` with a stable `code`; never
  `try/catch` to build a response; never branch on a localized message.

### Data
- Validate and whitelist before Prisma. Never spread a request body into `data`.
- Uniqueness = DB constraint **on the normalized value** + application validation.
- Multi-step writes use `withTransaction`. Concurrency-sensitive sections use `advisoryLock`.
  **Background/scheduler code is not exempt** — it is where this is most often forgotten.
- External/at-most-once side effects use `runIdempotent`. Never check-then-send.
- Entities edited by more than one actor carry `revision` and are updated with it in the `where`.

### Side effects — one door each
- In-app notifications: `fastify.notify.send(...)` **only**. Never `prisma.notification.create`.
- Outbound messages: the `messaging` service **only**. Never construct a provider transport
  elsewhere.
- Audit rows: `request.setAudit(...)` **only**. Never `prisma.auditLog.create`.
- Files: the `secureFile` service **only**, and always with an ownership resolver.

### Modules
- One module = one bounded context. A module may own several URL prefixes via `mounts` — do **not**
  create a sibling module just to get a URL.
- No cycles between modules. Cross-domain access goes through `contracts/`.

### Honesty
- Never ship a stub that silently succeeds or silently skips. Implement it, or throw
  `NOT_IMPLEMENTED`.
- If you knowingly leave debt, annotate it `@debt(reason, owner)` — `check:architecture` collects it.
- **The reference implementations in this repo may be wrong.** If one contradicts a rule above,
  report it; do not copy it.

## Before claiming done
Run `npm run verify`. It runs typecheck, lint, all `check:*` scripts, build and tests.
`npm test` **fails** if any suite is skipped without `ALLOW_SKIP=1` — a skipped security test is not
a passing one. If a gate failed or was skipped, say so with the output.
```

## Part D — Proposed `AGENTS.md` (TL;DR card)

```markdown
# AGENTS.md
Full rules: CLAUDE.md. Patterns: docs/backend-patterns/BACKEND-PATTERN-REGISTRY.md.

- Route metadata is the contract: `access` is mandatory; permission ≠ scope; both are declared.
- One door per side effect: notify / messaging / setAudit / secureFile. Never touch the tables directly.
- Atomic by default: withTransaction for multi-step writes (including in schedulers),
  advisoryLock for contention, runIdempotent for external effects, revision for shared entities.
- Single-use tokens: conditional updateMany + count. Never check-then-write.
- Contract-first: zod in, zod out, binaryResponse() for streams, AppError with a stable code.
- Uniqueness: DB constraint on the normalized value.
- Never log secrets — including inside URLs.
- Done = `npm run verify` green, with no silently skipped suites.
```

## Part E — `docs/backend-patterns/BACKEND-PATTERN-REGISTRY.md`

One file, one section per pattern, every section identical in shape. Template:

```markdown
### <Pattern name>
**Purpose:** one sentence.
**Required when:** the conditions that make this mandatory.
**Not suitable when:** the cases where it is the wrong tool, and what to use instead.
**Import:** `import { x } from "src/lib/…"`
**Reference implementation:** `src/modules/<module>/<file>.ts:<line>`
**Example:** 5–15 lines, copy-pasteable.
**Verify:** the `npm run check:*` command that enforces it.
```

Patterns to ship (each with a *correct* reference implementation, verified by `check:architecture`):

| # | Pattern | Reference implementation |
| --- | --- | --- |
| 1 | Creating a module | generator output |
| 2 | Public route | `auth/routes/public/route.ts` |
| 3 | Authenticated self-scoped route | `notifications/routes/user/route.ts` |
| 4 | Permission-protected route | `users/routes/admin/route.ts` |
| 5 | Scope resolver (branch/department/tenant) | `lib/scope/*` + `complaints.loadScoped` |
| 6 | API-key route + scopes | `api/routes/external/v1/route.ts` |
| 7 | Request/response schemas + envelope | `lib/http/response.ts` |
| 8 | Binary/stream response | `binaryResponse()` + a file download |
| 9 | Errors, stable codes, guided conflicts | `lib/errors/*`, `complaints.errors.ts` |
| 10 | Pagination, sorting, filtering | `listQuery()` + `lib/http/pagination.ts` |
| 11 | Transactions | `public-surveys.finalizeCore` ⭐ (best in repo) |
| 12 | Advisory locks | `call-center.claimItem` |
| 13 | Optimistic concurrency (`revision`) | `complaints` transitions |
| 14 | Single-use token consumption | `two-factor` challenge/recovery ⭐ |
| 15 | Idempotency | `runIdempotent` + `quick-send.create` |
| 16 | Transactional outbox | `writeOutboxEvent` in `finalizeCore` ⭐ |
| 17 | Saga / compensation | `saga()` |
| 18 | Audit | `request.setAudit` + `plugins/audit.ts` |
| 19 | Notifications (audience → preferences → channels → delivery → dedupe → log) | `notifications` reference module |
| 20 | Messaging / email templates | `messaging` + DB templates |
| 21 | Non-production recipient allowlist | `lib/email/recipient-allowlist.ts` ⭐ (adopt verbatim) |
| 22 | Secure files (ownership + signed download) | `complaint-attachments.service.ts` ⭐ |
| 23 | Settings & capabilities | `defineSettings()` |
| 24 | Background jobs | scheduler + leader election |
| 25 | Import (row-level, locked, idempotent) | `imports` + `row-evaluate.ts` ⭐ |
| 26 | Export | `exportEndpoint()` |
| 27 | Canonical key + DB constraint | `prisma-extensions.ts` + `master-data.prisma` ⭐ |

⭐ = already present in V1 at reference quality; lift as-is.

## Part F — Mandatory agent workflow (short enough to actually follow)

Ten steps, one line each. Anything longer gets skipped.

```
1. Read the standards section for this task (linked from the pattern registry).
2. Find the pattern in BACKEND-PATTERN-REGISTRY.md. If none fits, say so.
3. Open the nearest reference module and copy its shape.
4. Name the source of truth and the status vocabulary you will write.
5. Declare route access + permissions + scope BEFORE writing the handler.
6. Write the zod request/response schemas BEFORE the service.
7. Decide, in writing: transaction? lock? idempotency? snapshot? revision? audit?
8. Implement — service first, handler last.
9. Run `npm run verify`.
10. Report deviations: what you bypassed, why, and annotate it @debt.
```

Steps 5–7 are the load-bearing ones: they are exactly the decisions that, when made implicitly in
V1, produced the SLA transaction gap, the notification bypasses and the file-ownership hole.
