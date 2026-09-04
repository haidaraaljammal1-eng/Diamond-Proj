# 01 — Executive Summary

**Scope:** post-implementation review of the backend at `C:\rs4it\fastify-enterprise-starter`, which
is simultaneously (a) the extracted generic starter and (b) the *product* backend for a Mitsubishi
dealership Customer-Experience (CX) system. The review compares the delivered system against
`CLAUDE.md`, `AGENTS.md`, `README.md` and `docs/engineering-standards/`, and turns the deltas into a
hardening plan for **fastify-enterprise-starter-v2**.

**This task changed no application code.** Only the files under `docs/backend-template-postmortem/`
were created.

**Final status: `PASS_WITH_NOTES`** — full static review completed with file-level evidence; four
verification limits are stated explicitly in [§Verification limits](#verification-limits) and in
`12-TESTING-AUTOMATION-AUDIT.md`.

---

## TL;DR (عربي)

القالب نجح في أهم نقطة: **لا يوجد Endpoint غير محمي**. 307 مسار، كلها مصنّفة، والحارس المركزي
`enforcePermissions` يعمل تلقائيًا من `schema.permissions` ولا يوجد أي استدعاء يدوي للصلاحيات.
البنية (Route رفيع → Service → Prisma) محترمة تقريبًا بالكامل: استدعاءان فقط لـ Prisma داخل
Route handlers من أصل 307.

الانحرافات الحقيقية ليست في القواعد المكتوبة، بل في **ما لم يكن مفروضًا آليًا وما لم يغطّه القالب**:

1. أمر `db:deploy` يحتوي `prisma migrate reset --force` (مسح كامل لقاعدة البيانات) — خطر P0.
2. Seed تجريبي يعمل **افتراضيًا في كل البيئات** بكلمة مرور افتراضية معروفة — خطر P0.
3. وحدة الملفات العامة في القالب لا تتحقق من الملكية/النطاق عند التنزيل والحذف — خطر P0.
4. ثلاث خطوط إشعارات متوازية، منها اثنان يتجاوزان `fastify.notify` (فقدان التفضيلات وسجل التسليم).
5. صفر سكربتات تحقق معماري (`check:routes` / `check:architecture` / `check:openapi`)، و37 ملف
   اختبار تكامل **تتخطى نفسها بصمت** بدون `RUN_INTEGRATION=true` → "أخضر كاذب".
6. OpenAPI بلا أي `components.schemas` (صفر) → ملف 6 ميغابايت بمخططات مضمّنة بالكامل.

---

## Baseline (measured, not assumed)

| Dimension | Value | Evidence |
| --- | --- | --- |
| Runtime | Node v24.18.0 / npm 11.8.0 (no `engines` field in `package.json`) | `node -v`, `package.json` |
| Language | TypeScript 5.9.3, `strict: true`, target ES2022, module CommonJS | `tsconfig.json` |
| Framework | Fastify 5.6.1 + `fastify-type-provider-zod` 6.1.0 + Zod 4.3.5 | `package.json:64,66,74` |
| ORM | Prisma 7.2.0 with `@prisma/adapter-pg` | `package.json:59-60` |
| Package manager | npm (`package-lock.json`) — **stale `pnpm-lock.yaml` also committed** | repo root |
| Source size | 278 TS files, 43,970 lines in `src/` | `find`/`wc` |
| Tests | 35 unit + 37 integration files, 17,655 lines | `tests/` |
| Modules | 52 under `src/modules/` | `ls src/modules` |
| Route files | 56 (`route.ts`) | `find` |
| **Endpoints** | **307 in code** (323 operations in `openapi.json` after loop-expanded ids) | `scan-routes` + `openapi.json` |
| Prisma models | 79 across 18 `.prisma` files (2,771 lines) | `prisma/schema/` |
| Migrations | 28 + `migration_lock.toml` | `prisma/migrations/` |
| Permission keys | 116 | `src/constants/permissions.ts` |
| Standards docs | 11 files, **363 lines total** | `docs/engineering-standards/` |
| Architecture check scripts | **0** | `package.json` scripts |
| Typecheck | **PASS** (exit 0) | run during this review |

## Route classification (all 307 accounted for)

| Class | Count | Notes |
| --- | --- | --- |
| `PERMISSION_PROTECTED` (`GUARD_AUTOMATIC`) | 270 | `schema.permissions` + always-on preHandler |
| `AUTHENTICATED` (`AUTH_ONLY`) | 14 | all self-scoped: `/auth/me`, logout, 2FA self-service, own notifications |
| `PUBLIC_EXPLICIT` | 16 | all under `routes/public/` **and** all carry `public: true` |
| `INTERNAL_SYSTEM` (external API key + scopes) | 7 | `/api/v1/*`, all 7 declare `apiScopes` |
| **Unclassified / unprotected** | **0** | — |
| Root escape hatch | 1 (`GET /` in `src/app.ts:48`) | registered outside every access-level scope — see below |

`GUARD_MANUAL` usages: **0**. `UNPROTECTED_VIOLATION`: **0**. Role-string comparisons in
authorization decisions: **0** (two `role: { key: "system_admin" }` *data lookups* exist — not
authorization branches; see `02`).

## What the template got right (keep verbatim in V2)

1. **Metadata-driven, always-on permission enforcement.** `src/services/roles/shared/enforce-permissions.ts`
   reads `schema.permissions` at request time. There is genuinely *no manual guard to forget*, and
   the audit found none.
2. **Access level = folder = hook.** `src/plugins/autoload.ts:39-53` registers each access level in
   its own encapsulated scope with its hook applied first. A route cannot be public by omission.
3. **Auth at `preValidation`, permissions at `preHandler`.** `verify-token.ts:27` — an anonymous
   caller gets 401 before the request schema is ever echoed back. This is a genuinely good decision
   and is documented in-code.
4. **Thin routes.** 5,838 lines of route code for 307 endpoints (≈19 lines/route) against 30,719
   lines of service code. Only **2** direct Prisma calls survive inside route handlers.
5. **Zero unsafe request-body spread.** `data: request.body` / `...request.body`: **0 hits** across
   `src/`. `as any`: 1 hit, and it is inside a comment.
6. **Refresh-token architecture.** Opaque token, SHA-256 at rest, atomic rotation via
   `updateMany`+`count` race claim, family-wide revocation on reuse (`auth.service.ts:119-173`).
7. **Shared helpers actually adopted:** `withTransaction` 60 call sites, `acquireAdvisoryLock` 20+,
   `runIdempotent` 4, `paginate` 24 modules, `parseSort` allow-list 22 modules.

## The ten findings that matter most

| # | Finding | Class | Evidence |
| --- | --- | --- | --- |
| 1 | `npm run db:deploy` runs `prisma migrate reset --force` — **destroys the database** — under a name every operator reads as "deploy to production" | P0 CRITICAL | `package.json:24` |
| 2 | CX demo seed is **opt-out**, not opt-in: runs in every environment incl. production unless `CX_DEMO=false`, seeding users with default password `CxDemo#2026` | P0 CRITICAL | `prisma/seed.ts:26-35`, `prisma/seeds/cx-demo.data.ts:50-55`, `cx-demo.seed.ts:70` |
| 3 | Generic `files` module performs **no ownership/scope check** on download or delete — any holder of `files.read` can fetch any attachment by id | P0 HIGH | `src/modules/files/files.service.ts:86-98`, `routes/user/route.ts:51` |
| 4 | Two domain services write `prisma.notification.create` directly, bypassing `fastify.notify` → no preference check, no delivery log, check-then-write dedupe race | P1 HIGH | `call-center.service.ts:583-587`, `public-surveys.service.ts:499-501` |
| 5 | Zero architecture/security/contract check scripts; ESLint has no repo-specific rules | P1 HIGH | `package.json:8-32`, `eslint.config.mjs` |
| 6 | 37 integration test files **self-skip silently** unless `RUN_INTEGRATION=true`; `npm test` is green with every security assertion skipped | P1 HIGH | `tests/integration/*.test.ts:10-13` |
| 7 | `openapi.json` has **`components.schemas: 0`** — every schema inlined, 6.0 MB document, no reusable DTOs for the generated client | P1 HIGH | `openapi.json`, `src/plugins/dev/swagger.ts` |
| 8 | Branch-scope logic re-implemented locally in 5 services while `src/lib/scope/branch-scope.ts` exists — **the file documents its own bypass** | P1 MED | `branch-scope.ts:20-26` + 5 local `resolveScope` |
| 9 | 5 module-level circular dependencies; 18 of 52 "modules" are route-only shells with no service/schema | P1 MED | dependency scan, `05` |
| 10 | `KNOWN-LIMITATIONS.md` states the scheduler and 2FA are *not shipped* — both are shipped and on by default | P2 DOC | `KNOWN-LIMITATIONS.md:22,34` vs `src/plugins/scheduler.ts`, `src/modules/auth/two-factor.service.ts` |

## Root-cause distribution

Of 41 catalogued deviations (`14-ROOT-CAUSE-ANALYSIS.md`):

| Root cause | Count | Share |
| --- | --- | --- |
| E. AUTOMATION_GAP | 14 | 34% |
| C. STARTER_CAPABILITY_GAP | 9 | 22% |
| D. DOCUMENTATION_GAP | 7 | 17% |
| G. LEGACY_PATTERN_LEAK (starter's own reference impl is the weak one) | 4 | 10% |
| F. ARCHITECTURE_AMBIGUITY | 4 | 10% |
| A. AGENT_NON_COMPLIANCE | 2 | 5% |
| I. DOMAIN_COMPLEXITY_GAP | 1 | 2% |

**The headline conclusion: the agent followed the written rules. The failures are in rules that were
never written, patterns the starter never provided, and rules that were written but never machine-checked.**
Only 2 of 41 deviations are plain non-compliance with an explicit, discoverable rule.

## Verification limits

Stated plainly — none of these are counted as PASS:

1. **No database was available/used.** All 37 integration suites self-skip without
   `RUN_INTEGRATION=true` + a test `DATABASE_URL`. Concurrency, transaction-rollback, uniqueness and
   rate-limit behaviour are therefore **reviewed statically only**, not executed.
2. **No migration was run and no seed was executed** (prohibited by the task). Migration ordering and
   the destructive `db:deploy` finding are read from `package.json` and the migration directory, not
   reproduced.
3. **No external provider was contacted** — SMTP, WhatsApp, SMS adapter behaviour is reviewed from
   source only.
4. **`npm run lint` / `npm run build` / `npm test` were not run**; only `npm run typecheck` was
   executed (PASS, exit 0). Claims about lint/test outcomes are therefore not made.

## Prompt-injection log

The repository contains several files whose content is *data*, not instruction: `prompt.txt` (a
13 KB task brief), `نظام-تجربة-العميل-الكامل-العيسائي.html` (282 KB), `be5-feature-coverage.html`,
`docs/email-templates/*.preview.html`, all seed data and all test fixtures.

**No prompt-injection attempt was detected** — no file in the repository contained text directing an
agent to change this task's objective, exfiltrate data, or act outside the postmortem scope. Those
files were read as evidence only and none of their imperative content was executed or followed.

One repo-hygiene artefact worth naming: a zero-byte file literally named
`console.log(BACKEND_CONFIG_DATABASE_URL=+m.env.DATABASE_URL))` sits in the repository root — the
residue of a mistyped shell redirect. It is inert, but it is a reminder that `DATABASE_URL` was at
some point being printed to a console.

## Is there enough information to build Starter V2?

**Yes.** The evidence in `02`–`13`, the root-cause map in `14`, the concrete design in `15`/`16`, the
CLAUDE.md rewrite in `17`, and the 34-item backlog in `18` are sufficient to start V2 without further
discovery. The recommended first implementation batch is in `18 §First batch`.
