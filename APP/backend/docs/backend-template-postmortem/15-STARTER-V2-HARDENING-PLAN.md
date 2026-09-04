# 15 — Backend Starter V2 Hardening Plan

Concrete design for `fastify-enterprise-starter-v2`. Every item traces to evidence in `02`–`14`.

**Design axioms, derived from the root-cause analysis:**

1. *Enforce by construction, not by prose.* The one rule enforced structurally (permissions) has zero
   violations; every prose-only rule has violations.
2. *Every shared component ships an extension seam.* All 9 capability-gap findings are "the helper
   covered 80% and offered no hook for the rest".
3. *Never ship a silent stub.* A stub that returns `SKIPPED` teaches readers the abstraction is not
   serious. Implement it or throw `NOT_IMPLEMENTED`.
4. *Docs that assert facts about code must be verified by code.*
5. *Safe by default; dangerous requires an explicit, named opt-in.*

---

## 1. Route metadata registry + explicit classification

**Problem:** `AUTH_ONLY` is expressed by *omission* (14 routes), and `GET /` escapes every access
level (`app.ts:48`). A checker cannot distinguish "deliberately self-scoped" from "forgot the
permission".

**V2:** every route declares its class explicitly. Omission is a build failure, not a default.

```ts
// src/lib/http/route.ts
type RouteAccess =
  | { access: "public";        reason: string }                    // requires a written reason
  | { access: "authenticated"; selfScoped: true; reason: string }   // "my own record" — must say why
  | { access: "permission";    permissions: PermissionKey[]; mode?: "any" | "all" }
  | { access: "apiKey";        scopes: ApiScope[] }
  | { access: "internal";      reason: string };                    // liveness probes etc.
```

- `permissions` typed as `PermissionKey` (a union derived from the registry) → an unregistered key is
  a **type error**, closing the dynamic-permission hole at `complaints/routes/admin/route.ts:118`.
- Adds the `mode: "all"` semantics the current ANY-only `hasAnyPermission` cannot express.
- A `routes/internal/` access level with `internalHook` removes the need to register anything on the
  root instance.

**Enforcement:** `check:routes` fails when any `app.<method>` appears outside
`src/modules/**/routes/<level>/`, or when a route lacks `access`.

## 2. Always-on guard — keep, and extend to scope

Keep `enforcePermissions` **exactly as designed** (`enforce-permissions.ts`). Add a second always-on
stage:

```ts
// declared on the route, enforced by a preHandler — impossible to forget
scope: { resolver: "branch", entity: "complaint", param: "id" }
```

The scope resolver runs *after* the permission check and *before* the handler, so
`files.openDownload` (`11 §A.1`) cannot ship without one. Routes that genuinely need no scope declare
`scope: "none"` with a reason.

## 3. Safe scripts — the P0 fix

```jsonc
{
  "db:migrate":     "prisma migrate dev",                 // dev only
  "db:deploy":      "prisma migrate deploy",              // NOTHING destructive, ever
  "db:seed":        "tsx prisma/seed.ts",
  "db:reset:dev":   "tsx scripts/guard-dev-db.ts && prisma migrate reset --force"
}
```

`scripts/guard-dev-db.ts` refuses to run when `NODE_ENV=production` or when `DATABASE_URL` does not
match a `DEV_DB_ALLOWLIST` pattern. `check:security` asserts no `package.json` script contains
`migrate reset` outside `db:reset:dev`.

## 4. Seed safety — opt-in, never opt-out

```ts
// prisma/seed.ts
if (isProduction) { runBaseSeedOnly(); return; }         // structural, not flag-based
if (process.env.SEED_DEMO !== "true") { log("demo skipped (SEED_DEMO not set)"); return; }
if (!process.env.SEED_DEMO_PASSWORD) throw new Error("SEED_DEMO_PASSWORD is required");
```

- Demo data is **opt-in** (`SEED_DEMO=true`), never opt-out (today: `CX_DEMO=false` to disable).
- **No default password.** Today `CxDemo#2026` is the fallback (`cx-demo.seed.ts:70`).
- Base seed stays idempotent, hashes every password, sends no email, uses no real people.
- `check:security` asserts the demo seed has both an env-name guard and a production guard.

## 5. Architecture & security scripts

| Script | Asserts |
| --- | --- |
| `check:routes` | every route classified; no registration outside `modules/**/routes/<level>/`; every `public` has a reason; every `authenticated` declares `selfScoped` |
| `check:openapi` | `components.schemas` non-empty; document under a size budget; every operation has a 2xx **and** the shared error responses; no duplicate `operationId`; exported spec matches the built app |
| `check:architecture` | no module dependency cycles; layered import allow-list; no business logic in `route.ts` (no `prisma.` / `withTransaction` / `acquireAdvisoryLock`); collects `@debt(...)` annotations into a report |
| `check:security` | no `data: request.body` / body spread; no `$queryRawUnsafe` outside `lib/db/`; no `nodemailer` outside `lib/mail/`; no `prisma.notification.create` outside `modules/notifications`; no hardcoded secrets; no destructive script names; no secret-shaped values in log objects |
| `check:prisma` | every `@unique` column has ≥1 writer in `src/`; every model in the scoped list has a `revision` column; migrations in sync with schema |
| `check:permissions` | every `PermissionKey` used by a route exists in the registry and vice-versa; naming convention with a declared exception list |
| `verify` | `typecheck && lint && check:* && build && test` |

`verify` is the only command anyone needs to remember, and CI runs exactly it.

## 6. Module generator

```
npx create-module complaints --access admin --scope branch --with-audit --with-notifications
```

Emits `<name>.schema.ts`, `<name>.service.ts`, `routes/<level>/route.ts`, a permission-registry patch,
a Prisma model stub with `revision`, and a test file with the isolation test pre-written. **The
generated module passes `verify` on the first run.** This is how a correct pattern becomes the
cheapest path.

Modules may declare additional mount points so a domain never has to fragment into route-shells
(`05 §2`, C-6):

```ts
export const mounts = [
  { prefix: "/reports",   level: "admin", file: "routes/admin/route.ts" },
  { prefix: "/audit-log", level: "admin", file: "routes/admin/audit-log.route.ts" },
  { prefix: "/api-keys",  level: "admin", file: "routes/admin/api-keys.route.ts" },
];
```

## 7. Shared components — each with an extension seam

| Component | Default | Seam (the missing 20%) |
| --- | --- | --- |
| `withTransaction` | keep as-is | — |
| `advisoryLock` | keep as-is | — |
| **`runIdempotent`** | reserve-first | **release the reservation on failure** unless `terminalOnFailure`; return the stored `resultRef` on dedupe |
| **`notify`** | in-app + email | **audience-resolver registry**: `registerAudience(eventKey, resolver)` — callers emit an event, the pipeline resolves recipients; real EMAIL channel via `messaging`; a `dedupeKey` is **required**, not optional |
| **`messaging`** | one interface for EMAIL/SMS/WhatsApp/PUSH | provider adapters + DB templates; **replaces both** `mailer` and `ProviderRegistry` |
| **`secureFile`** | upload/download/delete | **`ownership` resolver per attachment kind** (required argument, not optional) + signed short-lived download tokens, modelled on `complaint-attachments.service.ts` |
| **`settings`** | typed KV | `defineSettings({...})` registry with types, defaults, `isSecret`, caching + explicit invalidation, and matrix (event × channel) support |
| **`capabilities`** | runtime flags | **computed from the same resolvers the send paths use**, never from env alone |
| **`scope`** | `resolveScope(domain, viewer)` | single API; pluggable dimension (branch / department / tenant); empty set ⇒ matches nothing (keep today's critical invariant) |
| `sequence(tx, scope)` | new | composite-unique-backed numbering |
| `exportEndpoint()` | new | permission + scope + audit + dedicated rate limit + row cap + streaming + `binaryResponse` schema |
| `saga()` | new | steps + compensations + durable state, generalising `quick-send.create` |
| `listQuery({...})` | new | one factory → zod schema + sort/filter allow-list + `paginate` |
| `binaryResponse()` | new | documents streams in OpenAPI instead of omitting the schema |

**Rule: a shared component with a stubbed branch must throw `NOT_IMPLEMENTED`, never return
`SKIPPED`.**

## 8. Reference modules — correct, and used as fixtures

Four reference modules ship, and `check:architecture` runs against them so they can never rot:

| Module | Demonstrates |
| --- | --- |
| `users` | CRUD + `revision` optimistic concurrency + transactional status change + session revocation + audit |
| `roles` | permission registry + RBAC + last-admin protection |
| `settings` | typed registry + secret handling + cache invalidation |
| `notifications` | full pipeline: event → registered audience resolver → preferences → channels → delivery → dedupe → log |
| `files` | **ownership-resolver-based** secure upload/download (fixing G-1) |

Each ships with its isolation test (`user A cannot read user B's row`) as the copy-paste template.

## 9. Auth hardening (from `03`)

| Fix | Detail |
| --- | --- |
| Verify `payload.type === "access"` | closes the latent token-confusion hole |
| `refresh` re-reads user status | a suspended user cannot mint a new access token |
| Single-use token consumption | `updateMany({ where: { id, usedAt: null } })` + `count` **everywhere** — one helper, `consumeSingleUseToken()` |
| Never log a secret-bearing URL | dev affordance becomes a flag-gated endpoint |
| Password policy | `PASSWORD_MIN_LENGTH` env + pluggable policy hook |
| API-key compare | `timingSafeEqual` |
| Rate limiting | per-IP **and** per-account-identifier; pluggable store (memory → Redis) with the same interface; `trustProxy` from an env allow-list, not a hardcoded `true` |
| Sensitive-endpoint limits | required by `check:routes` for `public`, upload and export routes |

## 10. Data-integrity defaults

- Every generated model gets `revision Int @default(0)`; `check:prisma` warns when an `update` on a
  revisioned model omits it from the `where`.
- DB constraint checklist in the module generator's output comment: *what is the canonical value?
  what is unique on it? what is the compound key? what is the FK behaviour?*
- `check:prisma` flags `@unique` columns with no writer (catches E-10).

## 11. Docs that cannot rot

- `docs/backend-patterns/BACKEND-PATTERN-REGISTRY.md` (see `17 §Pattern registry`) — every pattern
  carries **Purpose / Required when / Not suitable when / Import path / Reference implementation /
  Example / Verification command**.
- `KNOWN-LIMITATIONS.md` gains a `check:docs` job asserting each "not shipped" claim against the
  source tree (would have caught D-1 and D-2).
- `README.md` script descriptions are generated from `package.json` (would have caught D-3).
- The standards pack ships **complete** — the 9 missing files (D-4) are written, and each contains
  code, not only principles (D-5).

## 12. Starter vs product separation

`CLAUDE.md` says the starter carries "no business domain", but the delivered repository contains 79
models and a full CX domain, plus `exceljs`/`pdfkit`/`bidi-js`/`jszip` in its dependencies.

V2 must make the boundary structural:

```
packages/starter-core/     # auth, rbac, audit, notifications, files, settings, http, db  — no domain
packages/starter-checks/   # check:* scripts, ESLint rules, generator
apps/<product>/            # domain modules, product deps, product Prisma models
```

Otherwise V2 will accumulate the next product's domain exactly as V1 did.
