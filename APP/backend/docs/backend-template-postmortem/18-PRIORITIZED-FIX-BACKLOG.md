# 18 — Prioritized Backlog for Backend Starter V2

34 items. Every item is a **V2 change**, not a fix to the current system (this task is
analysis + documentation only).

Priorities: **P0** security / auth / route exposure / data integrity · **P1** architecture drift,
repeated patterns, OpenAPI, transactions · **P2** developer productivity, testing, documentation ·
**P3** nice to have. Effort: S ≤ ½ day · M ≤ 2 days · L ≤ 1 week.

---

## P0 — 6 items

### V2-001 — `db:deploy` must never be destructive
- **Problem:** `db:deploy` begins with `prisma migrate reset --force`, which drops the database.
- **Evidence:** `package.json:24`; `README.md:51` documents it as "prod: prisma migrate deploy".
- **Starter V2 change:** `db:deploy = "prisma migrate deploy"`. A separate `db:reset:dev` calls
  `scripts/guard-dev-db.ts` first, which aborts on `NODE_ENV=production` or a non-allowlisted
  `DATABASE_URL`.
- **Prevention:** `check:security` fails if any script contains `migrate reset` outside `db:reset:dev`;
  `check:docs` asserts README script text matches `package.json`.
- **Priority/Effort/Risk:** P0 / S / low · **Deps:** none
- **Acceptance:** `npm run db:deploy` on a populated DB applies migrations and loses no rows;
  `check:security` fails on a reintroduced reset. · **Root cause:** E-1, D-3

### V2-002 — Demo/seed data opt-in and production-guarded
- **Problem:** the CX demo seed runs in **every** environment unless `CX_DEMO=false`, creating users
  with the default password `CxDemo#2026`.
- **Evidence:** `prisma/seed.ts:26-35`, `prisma/seeds/cx-demo.data.ts:50-55`, `cx-demo.seed.ts:70`.
- **V2 change:** demo runs only when `SEED_DEMO=true`; hard-refuses when `isProduction`; no default
  password — `SEED_DEMO_PASSWORD` required or the seed throws.
- **Prevention:** `check:security` asserts the demo entry point has both guards and no password
  fallback.
- **P0 / S / low** · **Deps:** none
- **Acceptance:** `NODE_ENV=production npm run db:seed` seeds only the base foundation; unset
  `SEED_DEMO_PASSWORD` fails loudly. · **Root cause:** E-2

### V2-003 — Files: mandatory ownership/scope resolver
- **Problem:** `files.openDownload` / `files.remove` look up by id with no ownership or scope filter;
  any holder of `files.read` can read any attachment.
- **Evidence:** `src/modules/files/files.service.ts:86-98`; `routes/user/route.ts:51,79`.
- **V2 change:** `secureFile` requires an `ownership` resolver per attachment kind (non-optional
  argument), modelled on `complaint-attachments.service.ts` — scope check on list, on access-token
  mint **and again** on stream, plus signed short-lived download tokens.
- **Prevention:** `check:security` — an upload/download route without an ownership resolver fails the
  build; the reference module ships with an isolation test.
- **P0 / M / medium** · **Deps:** V2-010 (scope API)
- **Acceptance:** user B receives 404 for user A's attachment in an executed integration test.
- **Root cause:** G-1

### V2-004 — Atomic single-use token consumption everywhere
- **Problem:** password-reset / account-setup tokens are consumed check-then-write; the 2FA code in
  the same repo does it atomically.
- **Evidence:** `auth.service.ts:233-253` vs `two-factor.service.ts:158-162,423-424`.
- **V2 change:** one `consumeSingleUseToken(tx, model, where)` helper using
  `updateMany({ where: { …, usedAt: null } })` + `count === 1`; all token flows use it.
- **Prevention:** `check:security` bans `usedAt` checks followed by an `update` keyed on `id` alone.
- **P0 / S / low** · **Deps:** none
- **Acceptance:** two concurrent redemptions of one token → exactly one success, one `TOKEN_INVALID`.
- **Root cause:** F-4, G-2

### V2-005 — Never log a secret-bearing URL
- **Problem:** the raw password-reset token is logged inside a `link` field; key-based redaction
  cannot see it. `to: user.email` is logged beside it.
- **Evidence:** `auth.service.ts:214-216`.
- **V2 change:** log a token **id** only; provide the dev affordance as a flag-gated
  `GET /__dev/last-reset-link` that exists only when `DEV_TOKEN_ECHO=true` and `NODE_ENV!==production`.
- **Prevention:** `check:security` rejects log objects with `link|url|callbackUrl` keys carrying
  token-shaped values.
- **P0 / S / low** · **Deps:** none · **Acceptance:** no log line contains a usable token.
- **Root cause:** E-13

### V2-006 — Every route explicitly classified; no route outside the access levels
- **Problem:** `AUTH_ONLY` is expressed by omission (14 routes), and `GET /` is registered on the root
  instance outside every hook.
- **Evidence:** `src/app.ts:48`; `02 §4`.
- **V2 change:** mandatory `access` discriminated union (`15 §1`), a `routes/internal/` level, and
  `PermissionKey`-typed permission arrays.
- **Prevention:** `check:routes`.
- **P0 / M / low** · **Deps:** none
- **Acceptance:** removing `access` from any route fails the build; `check:routes` reports 100%
  classified. · **Root cause:** E-11

---

## P1 — 13 items

### V2-007 — CI running `verify`, with integration tests actually executing
- **Problem:** no CI exists; `npm test` is green with all 37 integration suites silently skipped.
- **Evidence:** no CI config in the repo; `tests/integration/*.test.ts:10-13`; `package.json:27`.
- **V2 change:** CI runs `npm run verify` against a disposable Postgres; the test runner fails on any
  skipped suite unless `ALLOW_SKIP=1`.
- **P1 / M / low** · **Deps:** V2-008..013 land incrementally
- **Acceptance:** a PR that breaks refresh-token rotation fails CI. · **Root cause:** E-5, E-6

### V2-008 — `check:routes`
Route classification, no out-of-scope registrations, public routes carry a reason, sensitive routes
carry a rate limit, permission keys registered, no `prisma.` in route files.
**P1 / M / low** · Acceptance: reintroducing any of the six V1 conditions fails. · E-11, and guards §A.1

### V2-009 — `check:security` (ESLint restricted syntax + script)
All rules in `16 §A.3`, including the two P0 script/seed assertions and the side-effect door rules.
**P1 / M / low** · Acceptance: a `prisma.notification.create` outside the notifications module fails
the build. · E-1, E-2, E-4, E-13

### V2-010 — One scope API; delete the 5 local copies
- **Evidence:** `lib/scope/branch-scope.ts:20-26` documents its own bypass; local `resolveScope` in
  `call-center:58`, `complaints:73`, `reports:34`, `survey-responses:109`,
  `communication-timeline:167`.
- **V2 change:** `resolveScope(domain, viewer)` as the only API, pluggable dimension, preserving the
  critical invariant *empty assignment set matches nothing*.
- **Prevention:** `check:architecture` duplicate-shape warning.
- **P1 / M / medium** · **Deps:** none · **Root cause:** E-12

### V2-011 — Notifications: one door, with an audience-resolver seam
- **Evidence:** `call-center.service.ts:583`, `public-surveys.service.ts:501`;
  `plugins/notifications.ts:11-13,130-139`.
- **V2 change:** `registerAudience(eventKey, resolver)`; `dedupeKey` becomes **required**; the EMAIL
  channel is implemented through `messaging` (no stub); direct `Notification` writes banned.
- **P1 / M / medium** · **Deps:** V2-012 · **Acceptance:** two concurrent emits produce exactly one
  in-app row and one delivery-log row. · **Root cause:** A-2, C-3, C-4, G-3

### V2-012 — Unified `messaging` service (replaces `mailer` + `ProviderRegistry`)
- **Evidence:** 2 send interfaces, 4 template surfaces (`09 §5`).
- **V2 change:** one interface for EMAIL/SMS/WhatsApp/PUSH; DB-backed multi-language templates;
  provider adapters; the `DeliveryReason` vocabulary and the non-production recipient allowlist
  adopted **verbatim** from V1.
- **P1 / L / medium** · **Deps:** none · **Root cause:** C-2, F-1, F-2, I-1

### V2-013 — OpenAPI named schemas + `check:openapi`
- **Evidence:** `components.schemas: 0`, 6.0 MB document, 9 operations with no response schema.
- **V2 change:** registry-based schema naming so the spec emits `$ref`s; `binaryResponse()` helper;
  `commonErrorResponses` attached by default at the route-builder level.
- **P1 / M / low** · **Acceptance:** a generated client exposes one `Complaint` model, not N
  anonymous ones; document < 2 MB. · **Root cause:** E-7, E-8

### V2-014 — Transactions in background/scheduler code
- **Evidence:** `complaints.service.ts:1061-1109` — `autoEscalate` (3 writes) and `evaluateSla`
  (up to 8 writes/cycle) with no transaction and `notify` interleaved.
- **V2 change:** the reference scheduler cycle demonstrates
  `withTransaction` + `advisoryLock(complaintId)` per item, with side effects emitted after commit
  (or via the outbox); the pattern registry entry says so explicitly.
- **P1 / M / high** (silent history corruption today) · **Root cause:** A-1

### V2-015 — Idempotency helper: failure release + result return
- **Evidence:** `lib/db/idempotency.ts:16-37`; the 15-line hand-rolled compensation at
  `quick-send.service.ts:948-962`.
- **V2 change:** release the reservation on failure unless `terminalOnFailure`; return the stored
  `resultRef` on dedupe.
- **P1 / S / low** · **Root cause:** C-7

### V2-016 — DB constraint for notification dedupe + kill the dead unique column
- **Evidence:** `Notification` has no dedupe constraint; `NotificationDeliveryLog.dedupeKey @unique`
  has zero writers (`notifications.prisma:81` vs `plugins/notifications.ts:57`).
- **V2 change:** `@@unique([userId, eventKey, dedupeKey])` on the inbox row (or write the existing
  delivery-log key); `check:prisma` flags unique columns with no writer.
- **P1 / S / low** · **Deps:** V2-011 · **Root cause:** E-10

### V2-017 — Module `mounts`: end the route-shell pattern
- **Evidence:** 18 of 52 modules are route-only shells forced by directory-name URL derivation
  (`05 §2`).
- **V2 change:** modules declare `mounts: [{ prefix, level, file }]`; the generator uses it.
- **P1 / M / low** · **Root cause:** C-6

### V2-018 — `check:architecture`: cycles, layers, `@debt` collection
- **Evidence:** 5 module cycles; a dynamic `await import()` used to dodge one
  (`complaints/routes/admin/route.ts:27`).
- **P1 / M / low** · **Root cause:** E-9

### V2-019 — Optimistic concurrency by default
- **Evidence:** `revision` implemented in `complaints` only; settings, users and surveys are
  last-write-wins.
- **V2 change:** generator emits `revision Int @default(0)`; `check:prisma` warns when an update on a
  revisioned model omits it from the `where`.
- **P1 / M / low** · **Root cause:** D-7

### V2-020 — Honest capabilities
- **Evidence:** `plugins/capabilities.ts:24-29` hardcodes `email: env.EMAIL_ENABLED` while
  `resolveEmailTransport` lets a DB integration win — and `notifications.ts:130` gates the EMAIL
  channel on the stale flag.
- **V2 change:** capabilities computed by the same resolvers the send paths use, cached with explicit
  invalidation.
- **P1 / S / medium** · **Deps:** V2-012 · **Root cause:** G-4

---

## P2 — 11 items

| ID | Title | Problem / Evidence | V2 change | Effort |
| --- | --- | --- | --- | --- |
| V2-021 | Module generator | correct pattern must be the cheapest path | `create-module` emitting schema/service/routes/permissions/model/tests that pass `verify` | L |
| V2-022 | Backend Pattern Registry | `05`/`13` show pattern choice was undocumented | `docs/backend-patterns/BACKEND-PATTERN-REGISTRY.md`, 27 patterns, each with reference impl + verify command (`17 §E`) | M |
| V2-023 | Complete the standards pack | 9 of 18 referenced files do not exist; total pack = 363 lines (D-4, D-5) | write the missing 9; every file carries code and import paths | L |
| V2-024 | `check:docs` | `KNOWN-LIMITATIONS.md` claims the scheduler and 2FA are not shipped; both are (D-1, D-2) | assert "not shipped" claims against the source tree; README scripts against `package.json` | S |
| V2-025 | Test-coverage gaps | no test for transaction rollback, DB constraints, notification isolation, **file download authorization**, audit-row creation (`12 §C`) | ship these five as reference tests in the reference modules | M |
| V2-026 | `exportEndpoint()` helper | 5 hand-rolled exports; none rate-limited, none row-capped, none streaming, none schema'd (`11 §D.2`) | one helper bundling permission + scope + audit + rate limit + cap + stream + `binaryResponse` | M |
| V2-027 | Rate limiting: per-account + pluggable store | per-IP, in-memory only; `trustProxy: true` hardcoded (`03 §6`) | per-IP **and** per-identifier; memory/Redis behind one interface; `trustProxy` from an env allow-list | M |
| V2-028 | `listQuery()` factory | `pageSize` vs `limit`; per-module maxima exceeding `MAX_PAGE_SIZE` (`13 §B`) | one factory → schema + sort/filter allow-list + `paginate` | S |
| V2-029 | Access-token `type` claim verified | `type: "access"` signed but never checked (`03 §2`) | assert the claim; separate secret/audience per token purpose | S |
| V2-030 | `refresh` re-checks user status | a just-suspended user can still mint an access token (`03 §2`) | join the user row and reject non-`ACTIVE` | S |
| V2-031 | Settings registry with caching | uncached per-call `findUnique`; no key validation; 3 config mechanisms coexist (F-3, `11 §B.1`) | `defineSettings({...})` typed registry, cache + invalidation, matrix support | M |

---

## P3 — 4 items

| ID | Title | Note |
| --- | --- | --- |
| V2-032 | Starter/product package split | `packages/starter-core` + `apps/<product>`; today 79 domain models and `exceljs`/`pdfkit`/`jszip` live in a "generic starter" (`13 §C`) |
| V2-033 | Repo hygiene | remove the stale `pnpm-lock.yaml`, add `engines`, drop unused `pm2`, review `zod-prisma-types` (git-ignored output), stop committing a 6 MB `openapi.json`, delete the stray zero-byte `console.log(...)` file (`12 §F`) |
| V2-034 | Audit hardening | DB-level append-only (revoke UPDATE/DELETE or add a trigger); attribute the 4 auth endpoints + report run + call-center answer write; define retention (`10 §3-4`) |
| V2-035 | Password policy + API-key `timingSafeEqual` | `PASSWORD_MIN_LENGTH` env + pluggable policy; constant-time key compare (`03 §1,5`) |

---

## Recommended first implementation batch

Two weeks, in this order. Rationale: close both P0 data-loss/exposure risks first, then make the
system honest about its own test results, then protect the template's strongest asset from
regression.

| Order | Items | Why first |
| --- | --- | --- |
| 1 | **V2-001**, **V2-002** | one command destroys production data; another seeds a known password into it. Both are ≤ ½ day. |
| 2 | **V2-007** (CI) + test-skip guard | until integration tests actually run, every other fix is unverified. This alone converts this postmortem's four verification limits into observed results. |
| 3 | **V2-009** (`check:security`) | locks in items 1–2 permanently and adds the side-effect door rules. |
| 4 | **V2-003**, **V2-004**, **V2-005** | the three remaining P0 security fixes, now with CI to prove them. |
| 5 | **V2-006** + **V2-008** (`check:routes`) | protects the one thing V1 got completely right — 307/307 classified, 0 unprotected — from ever regressing. |
| 6 | **V2-021** + **V2-022** (generator + pattern registry) | from here on, the correct pattern is the cheapest path, which is the only durable fix for the 9 capability-gap findings. |

Everything after that (messaging, notifications, scope unification, OpenAPI naming) is a normal
roadmap. The batch above is what makes V2 *structurally* safer than V1 rather than merely
better-documented.
