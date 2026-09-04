# 13 — Shared Backend Utilities, Pagination & Dependency Audit

---

## Part A — Shared-helper adoption

This is the single most instructive table in the postmortem. Every helper below shipped in the
starter. Adoption is not uniform, and the split is not random.

| Shared component | Location | Adoption | Verdict |
| --- | --- | --- | --- |
| `withTransaction` | `lib/db/transaction.ts` | **60 call sites**; 1 raw `$transaction` bypass | `SHARED_USED` |
| `acquireAdvisoryLock(s)` | `lib/db/advisory-lock.ts` | 20+ sites, 6 modules, always inside a tx | `SHARED_USED` |
| `AppError` + `ErrorCode` | `lib/errors/*` | universal; 0 `try/catch`-to-respond | `SHARED_USED` |
| `dataResponse` / `listResponse` / `MessageResponseSchema` | `lib/http/response.ts` | universal | `SHARED_USED` |
| `PaginationQuerySchema` | `lib/http/pagination.ts` | 24 modules | `SHARED_USED` |
| `paginate()` | same | 24 modules | `SHARED_USED` |
| `parseSort()` allow-list | same | 22 modules | `SHARED_USED` |
| `commonErrorResponses` | `lib/http/response.ts` | 298 / 307 routes | `SHARED_USED` |
| `hashPassword` / `verifyPassword` | `lib/security/password.ts` | only path to a password | `SHARED_USED` |
| `generateOpaqueToken` / `hashToken` | `lib/security/tokens.ts` | refresh, reset, setup, 2FA challenge, recovery codes, API keys | `SHARED_USED` |
| `sanitizeForAudit` / `maskIp` | `lib/security/redact.ts` | audit writer | `SHARED_USED` |
| `verifyContentType` / `sniffMime` | `lib/files/magic-bytes.ts` | both file implementations | `SHARED_USED` |
| `generateStorageKey` / `resolveStoragePath` | `lib/files/storage-key.ts` | both file implementations | `SHARED_USED` |
| `normalizeEmail` / `normalizeName` | `lib/security/normalize.ts`, `lib/master-data/code.ts` | + enforced by a Prisma client extension | `SHARED_USED` ⭐ |
| `isUniqueViolation` / `mapPrismaError` | `lib/db/prisma-error.ts` | error handler + outbox + delivery paths | `SHARED_USED` |
| `writeOutboxEvent` | `lib/db/outbox.ts` | 1 producer (survey submission) | partial |
| **`runIdempotent`** | `lib/db/idempotency.ts` | **4 sites** | `SHARED_BYPASSED` |
| **`resolveBranchScope`** | `lib/scope/branch-scope.ts` | 4 of 9 scope-using services | `SHARED_BYPASSED` |
| **`fastify.notify`** | `plugins/notifications.ts` | 2 sites; 2 direct-insert bypasses; 1 parallel pipeline | `SHARED_BYPASSED` + `SHARED_COMPONENT_CAPABILITY_GAP` |
| **`fastify.mailer`** | `plugins/mailer.ts` | 2 sites (auth only); all domain mail uses `ProviderRegistry` | `SHARED_COMPONENT_CAPABILITY_GAP` |
| **`files.service`** | `modules/files` | 1 domain re-implemented it (better) | `DUPLICATED_LOCAL_IMPLEMENTATION` + `SHARED_COMPONENT_CAPABILITY_GAP` |
| **`fastify.settings`** | `plugins/settings.ts` | bypassed by `reports.config.ts` and `ComplaintNotificationSetting` | `SHARED_BYPASSED` |
| `fastify.capabilities` | `plugins/capabilities.ts` | used, but reports stale data | `SHARED_COMPONENT_CAPABILITY_GAP` |
| Sequence generation | **no helper exists** | each domain uses `@@unique([parent, number])` | `SHARED_COMPONENT_CAPABILITY_GAP` |
| Date/business-day handling | **no helper exists** | `dashboard-business-day` logic is module-local (with its own unit test) | gap |
| Search normalization | partial (`normalize.ts`) | each module builds its own `contains` filters | gap |
| Saga / compensation | **no helper exists** | hand-rolled in `quick-send.create` | gap |
| Export endpoint helper | **no helper exists** | 5 hand-rolled exports | gap |

### The pattern behind the pattern

Sort the table by adoption and one rule explains almost all of it:

> **Helpers that solve a *mechanical* problem were adopted ~100%.
> Helpers that encode a *policy* were bypassed whenever the domain needed one thing they did not offer.**

- `withTransaction`, `paginate`, `AppError`, `hashToken` — no policy, no missing capability, adopted
  everywhere.
- `notify`, `mailer`, `files`, `settings`, `resolveBranchScope` — each embeds a policy decision
  (who receives, which template, who may read, where config lives). Each was bypassed at the first
  domain requirement it did not cover.

The failure mode is never "the developer didn't know the helper existed". It is: **the helper covered
80% of the case, offered no extension point for the other 20%, and re-implementing was cheaper than
extending.** Every one of the five bypasses fits this exactly:

| Bypass | The missing 20% |
| --- | --- |
| `notify` → direct insert | audience resolution + a real EMAIL channel (the built-in one is a stub) |
| `mailer` → `ProviderRegistry` | DB-backed multi-language templates, multi-channel, delivery ledger |
| `files` → `complaint-attachments` | ownership/branch scope + signed short-lived download tokens |
| `settings` → `reports.config` / `ComplaintNotificationSetting` | typed grouped config + a per-event×channel matrix |
| `resolveBranchScope` → 5 local copies | pre-dated the helper; helper returns a shape the older callers don't use |

**V2's central design rule follows directly: every shared component must ship an extension seam
(strategy/resolver/adapter) alongside its default, and must be adopted by the reference modules.**

## Part B — Pagination, filtering & sorting audit

| Check | Result |
| --- | --- |
| Server-side pagination on collections | ✅ 24 modules use `paginate()` |
| Max page size | ✅ `MAX_PAGE_SIZE = 100` enforced by zod (`.max(MAX_PAGE_SIZE)`) |
| Total/count behaviour | ✅ `count` + `findMany` in `Promise.all`; `buildPageMeta` returns `{page,pageSize,total,totalPages}` |
| **Unbounded list endpoints** | **0 found** — every list schema bounds its page/limit |
| Sort allow-list | ✅ `parseSort(input, allowedFields, fallback)` — unknown fields fall back, never reach Prisma |
| Filter allow-list | ✅ filters are explicit zod fields mapped by hand; no raw key pass-through |
| Local bounds that exceed the shared max | ⚠ `imports.schema.ts:259` — `pageSize … .max(200)` vs `MAX_PAGE_SIZE = 100`; `complaints.schema.ts:168` `limit … .max(100)`; `call-center.schema.ts:138` / `lookups.schema.ts:11` `.max(50)`; `users.schema.ts:114` `.max(100)` |
| Cursor pagination | not used (offset only) — acceptable at current scale |
| N+1 risk | ⚠ not statically provable. `fastify.settings.get()` is uncached and called per request; `report-runners.ts` deliberately uses grouped raw SQL to *avoid* per-branch queries (`:437-440` documents this) |
| Large `include`/`select` | ⚠ `complaints.service.detail` and `public-surveys` version loading pull deep nested trees; bounded by domain size |
| Data leakage through broad filters | ✅ every scoped list applies branch/department scope **before** the query |

*Verdicts:* `PAGINATED_COMPLIANT` for all list endpoints. `UNSAFE_SORT`: 0. `UNSAFE_FILTER`: 0.
`UNBOUNDED_LIST`: 0. `N_PLUS_ONE_RISK`: unquantified (needs runtime profiling — verification limit).

The one inconsistency worth fixing in V2: three different names for the same concept (`pageSize`,
`limit`) and per-module maxima that silently exceed the shared constant. A single
`listQuery({ maxPageSize })` factory removes both.

## Part C — Dependency audit

**No change was made to `package.json`.** Classification only.

### Runtime dependencies (28)

| Package | Verdict | Note |
| --- | --- | --- |
| `fastify` 5.6.1 | KEEP | core |
| `@fastify/autoload` | KEEP | drives the access-level convention |
| `@fastify/{cors,helmet,cookie,formbody,compress,multipart,rate-limit,jwt,swagger,swagger-ui}` | KEEP | all used |
| `fastify-plugin` | KEEP | |
| `fastify-type-provider-zod` 6.1.0 | KEEP | but must be reconfigured for named schemas (`04 §3`) |
| `zod` 4.3.5 | KEEP | **single** validation library — no duplication ✅ |
| `@prisma/client` + `@prisma/adapter-pg` 7.2.0 | KEEP | |
| `@node-rs/argon2` | KEEP | prebuilt binaries, no node-gyp |
| `otpauth` | KEEP | 2FA |
| `pino` 10 | KEEP | |
| `nodemailer` 9 | KEEP | **single** mail client ✅ |
| `i18next` | KEEP | `t()` used repo-wide |
| `dotenv` | KEEP | |
| `sanitize-html` | KEEP | email HTML allow-list |
| `exceljs` | KEEP (product) | import/export; in-memory only |
| `pdfkit` + `bidi-js` | KEEP (product) | Arabic RTL PDF reports |
| `jszip` | REVIEW | used by report/export bundling — confirm it isn't dead weight |
| `zod-prisma-types` 3.3.10 | **REVIEW** | generates into `src/schemas/zod` which is **git-ignored and eslint-ignored**; only 1 entry present. If the generated schemas are not imported anywhere, this is a build-time cost with no consumer |

Notably **absent** and correct: no second JWT library, no second validator, no second HTTP client, no
`lodash`, no `moment`. Dependency hygiene is good.

### Dev dependencies (15)

| Package | Verdict | Note |
| --- | --- | --- |
| `typescript`, `typescript-eslint`, `eslint`, `@eslint/js`, `prettier`, `tsx`, `tsc-alias`, `@types/*` | KEEP | |
| `prisma` | KEEP | |
| `pino-pretty` | KEEP | dev transport |
| **`pm2` 7.0.3** | **REMOVE** | the deployment model is explicitly single-service in-process (`plugins/scheduler.ts:16-19`: "One container, one service, no external process manager"). `pm2` is a 20 MB dev dependency contradicting the documented architecture. |

### Security review targets

| Item | Note |
| --- | --- |
| `npm audit` | **not run** (verification limit — no network operation was performed) |
| Domain-specific deps in a "generic starter" | `exceljs`, `pdfkit`, `bidi-js`, `jszip` are CX-product concerns living in what `CLAUDE.md` calls a generic starter with "no business domain". V2 must split: starter core vs product. |
| Two lockfiles | `package-lock.json` (current) + `pnpm-lock.yaml` (stale, Jul 16). REMOVE one. |
| `engines` field | absent — add `"node": ">=20 <25"` |

## Part D — What V2's shared layer must add

Derived directly from Part A's gaps:

1. `runIdempotent` with failure-release + `resultRef` return.
2. `resolveScope(domain)` as the **only** scope API, with the 5 legacy copies deleted.
3. `notify` with a pluggable **audience resolver** registry and a real EMAIL channel.
4. A single `messaging` interface unifying `mailer` and `ProviderRegistry`.
5. `secureFile` foundation with an ownership/scope resolver per attachment kind + signed download tokens.
6. Typed `defineSettings({ … })` registry with caching, invalidation and grouped access.
7. `sequence(tx, scope)` helper backed by a composite unique.
8. `exportEndpoint()` helper (permission + scope + audit + rate limit + row cap + streaming + schema).
9. `saga()` / compensation helper.
10. `listQuery({ maxPageSize, sortable, filterable })` factory producing schema + parser + `paginate` in one call.
