# 12 — Testing & Architecture-Automation Audit

---

## Part A — Test inventory

| Metric | Value |
| --- | --- |
| Unit test files | 35 |
| Integration test files | 37 |
| Total test lines | 17,655 (vs 43,970 lines of `src/`) |
| Runner | `node:test` + `tsx` (no Jest/Vitest) |
| Unit tests requiring a DB | **0** (verified: no `PrismaClient` / `buildApp` import in `tests/unit/`) |
| Integration tests gated on `RUN_INTEGRATION` | **37 / 37** |
| Coverage tooling | none configured |

The 17,655 : 43,970 ratio is healthy, and the unit/integration split is clean — unit tests are pure
and fast, integration tests own everything that touches Postgres.

## Part B — The finding that matters: silent skipping

Every integration file opens with the same guard:

```ts
const RUN = process.env.RUN_INTEGRATION === "true";
if (!RUN) {
  test("… integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", { skip: true }, () => {});
}
```

`package.json:27` defines:

```json
"test": "node --import tsx --test tests/unit/*.test.ts tests/integration/*.test.ts"
```

So **`npm test` runs all 37 integration files and every one of them reports a green skip.** The
process exits 0. `24-DEFINITION-OF-DONE.md:26` lists `npm test` as a required gate and adds
"*(and `RUN_INTEGRATION=true npm run test:integration` when DB-affecting)*" — an unenforced,
easily-missed parenthetical.

The consequence is not hypothetical. These suites exist and are exactly the right ones:

| Suite | Guarantee it proves — **when it runs** |
| --- | --- |
| `security.test.ts` | public health route; protected route rejects anonymous; wrong password rejected; password stored hashed never plaintext; valid token authorizes `/auth/me`; invalid token rejected; permission-protected list requires the permission; **refresh rotates and reuse is rejected**; **suspended user cannot log in** |
| `rate-limit.test.ts` | auth limiter returns 429 `RATE_LIMITED` (never 500) with `Retry-After` |
| `two-factor.test.ts` | 2FA challenge/verify/recovery |
| `campaign-create-idempotency.test.ts` | idempotent campaign creation |
| `campaign-cross-campaign-duplicate-race.test.ts` | duplicate-send race |
| `campaign-rolling-concurrency.test.ts` | concurrent rolling enrollment |
| `lookup-permissions.test.ts`, `contextual-lookup-permissions.test.ts` | permission enforcement on lookups |
| `user-department-scope.test.ts`, `campaign-branch-scope.test.ts`, `complaint-user-summaries.test.ts` | **data isolation between users/branches** |
| `customer-communication-security.test.ts` | communication-timeline authorization |

**Every one of the security guarantees this postmortem could not verify has a test that was not
run.** The tests are not missing — the *default* is.

*Classification:* `E. AUTOMATION_GAP`, high severity, because it converts an entire security suite
into decoration under the default command.
*V2:* `npm test` must either (a) start a disposable Postgres (testcontainers / `docker compose`) and
run everything, or (b) **fail loudly** when integration tests are skipped unless `ALLOW_SKIP=1` is
explicitly set. A skipped security test must never look like a passing one.

## Part C — Coverage of the critical flows

| Required flow | Test exists | Runs by default |
| --- | --- | --- |
| Login / password hashing | ✅ `unit/password.test.ts` + `integration/security.test.ts` | unit ✅ / integration ❌ |
| Token generation & hashing | ✅ `unit/tokens.test.ts` | ✅ |
| Refresh rotation + reuse detection | ✅ `integration/security.test.ts` | ❌ |
| Suspended account blocked | ✅ `integration/security.test.ts` | ❌ |
| Permission guard | ✅ `integration/security.test.ts`, `lookup-permissions.test.ts` | ❌ |
| Explicit public routes | ✅ (health) | ❌ |
| **User data isolation** | ✅ `user-department-scope`, `campaign-branch-scope`, `survey-results-scope` (unit) | partial |
| Validation | ✅ across unit suites | ✅ |
| **DB uniqueness** | ⚠ implied by domain suites; no dedicated constraint test | ❌ |
| **Transaction rollback** | ❌ **no test** | — |
| Concurrency | ✅ 3 campaign race suites | ❌ |
| Idempotency | ✅ `campaign-create-idempotency` | ❌ |
| Notification isolation | ⚠ no dedicated suite for "user sees only own notifications" | — |
| File upload | ⚠ `unit/magic-bytes.test.ts` covers sniffing; **no test for the download ownership gap** (which is why the gap survives) | ✅ (unit only) |
| Audit | ⚠ `unit/redact.test.ts` covers sanitization; no test that a mutation writes a row | ✅ (unit only) |
| Rate limit | ✅ `integration/rate-limit.test.ts` | ❌ |
| 2FA | ✅ unit + integration | partial |
| Error envelope | ✅ `unit/app-error.test.ts` | ✅ |
| Redaction | ✅ `unit/redact.test.ts` | ✅ |
| Report rendering / RTL / localization | ✅ 3 unit suites | ✅ |

**Genuine coverage gaps (no test at all):** transaction rollback, DB-constraint enforcement,
notification recipient isolation, file download authorization, audit-row creation.

Note the correlation: **the two P0/P1 findings in this postmortem that a test could have caught —
file download ownership (`11 §A.1`) and notification bypass (`09 §1`) — are precisely the two areas
with no test.**

## Part D — Test infrastructure

| Aspect | Status |
| --- | --- |
| Isolation | `test:integration` uses `--test-concurrency=1`; a schema reset helper exists (`prisma/seed/e2e/reset-schema.cjs`) and a dedicated `.env.e2e` |
| Fixtures | per-suite, inline; no shared factory/builder layer → fixture logic is repeated across 37 files |
| Mocking | minimal and appropriate — `providers.ts` supports injecting a testing adapter (`providers.ts:25`), `complaint-notifications.ts` accepts `deps = { providers?, now? }`. **Time and providers are injectable; the DB is real.** Correct strategy. |
| Deterministic time | `now()` injection in several services ✅ |
| Deterministic randomness | seed uses mulberry32 PRNG ✅ |
| Coverage reporting | none |
| CI configuration | **none found in the repository** (no `.github/workflows`, no CI file) |

**There is no CI.** Every quality gate in `24-DEFINITION-OF-DONE.md` is a manual instruction to a
human or an agent. That single fact explains a large share of the findings in this postmortem: rules
that are only checked by whoever remembers to check them are checked inconsistently.

## Part E — Architecture-automation audit

### E.1 What exists

```
npm run dev | build | start
npm run typecheck | lint | format | format:write
npm run db:generate | db:migrate | db:deploy | db:seed
npm run openapi:export
npm run test | test:unit | test:integration
npm run seed:demo | seed:cx-demo | seed:cx-demo:reset | seed:cx-demo:verify
npm run worker:survey-distribution | simulate:notifications
npm run campaigns:audit | campaigns:audit:local | verify:reports
```

`npm run typecheck` was executed during this review: **PASS (exit 0)**.

### E.2 What is missing

| Command | Present? |
| --- | --- |
| `check:routes` | ❌ |
| `check:architecture` | ❌ |
| `check:openapi` | ❌ |
| `check:security` | ❌ |
| `check:prisma` | ❌ |
| `check:permissions` | ❌ |
| `verify` (composite gate) | ❌ |
| CI pipeline | ❌ |
| Coverage threshold | ❌ |

**Zero architecture-enforcement scripts exist.** `eslint.config.mjs` contains only three
project-specific rules — `no-console` (warn, allows `warn`/`error`), `no-unused-vars`, and
`no-explicit-any` (warn). There is **no** `no-restricted-imports`, **no** `no-restricted-syntax`, and
no custom rule of any kind.

### E.3 Which findings a script would have caught

| Finding | Detectable statically? | Rule |
| --- | --- | --- |
| `db:deploy` contains `migrate reset --force` | ✅ trivially | grep `package.json` scripts |
| Demo seed defaults ON | ✅ | assert seed entry is opt-**in** |
| `prisma.notification.create` outside the notifications module | ✅ | `no-restricted-syntax` |
| Route registered outside `modules/**/routes/<level>/` | ✅ | AST scan |
| Route with no response schema and no `binaryResponse` marker | ✅ | AST or exported-OpenAPI scan |
| `components.schemas` empty / spec size | ✅ | assert on `openapi.json` |
| Module dependency cycles | ✅ | dependency-cruiser / madge |
| `@unique` column with zero writers | ✅ | schema × source scan |
| Local `resolveScope` duplicating `resolveBranchScope` | ⚠ heuristic | naming + shape lint |
| Password reset token logged in a URL | ⚠ heuristic | ban `link`/`url` keys in log objects |
| Files download missing an ownership filter | ❌ | requires architect review |
| SLA writes needing a transaction | ❌ | requires architect review |
| Whether a snapshot is required | ❌ | requires architect review |

**Roughly 60% of this postmortem's findings are mechanically detectable.** That is the core argument
for `16-AUTOMATED-GUARDS-PROPOSAL.md`.

## Part F — Repository hygiene (observed while auditing)

| Item | Note |
| --- | --- |
| `openapi.json` (6.0 MB) committed | churns on every schema change; see `04 §3` |
| `pnpm-lock.yaml` **and** `package-lock.json` both committed | ambiguous package manager; `.npmrc` exists, npm appears authoritative — the pnpm lock is stale (Jul 16) |
| `prompt.txt` (13 KB task brief) in the repo root | working artefact |
| `نظام-تجربة-العميل-الكامل-العيسائي.html` (282 KB), `be5-feature-coverage.html` in root | working artefacts |
| `console.log(BACKEND_CONFIG_DATABASE_URL=+m.env.DATABASE_URL))` — a **zero-byte file** in the root | residue of a mistyped shell redirect; inert, but indicates `DATABASE_URL` was being printed to a console at some point |
| `artifacts/`, `uploads/`, `logs/` | `.gitignore` covers `uploads/*` and `logs`; `artifacts/` is not ignored |
| No `engines` field in `package.json` | the project runs on Node 24 while `README.md:15` claims "Node.js 20+" — untested combination is possible |
| `pm2` in devDependencies | unused per the single-service deployment design (`plugins/scheduler.ts` docblock) — `REMOVE` candidate |
