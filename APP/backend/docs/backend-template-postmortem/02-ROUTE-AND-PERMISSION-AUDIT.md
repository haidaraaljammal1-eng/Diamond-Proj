# 02 — Route Classification & Permission Enforcement Audit

Method: every `app.<method>("path", { … })` registration under `src/modules/**/route.ts` was parsed
programmatically (307 registrations), and each registration's option object was inspected for
`permissions`, `apiScopes`, `public: true`, `response`, `setAudit` and direct Prisma use. The access
level is derived from the `routes/<level>/` folder, which is what `src/plugins/autoload.ts` actually
uses to pick the hook — so classification is derived from the same source of truth the runtime uses,
not from file names.

---

## 1. Enforcement architecture (verified in source)

```
src/plugins/autoload.ts:39-53
  for level of [public, user, admin, external]
    fastify.register(scope => {
      HOOKS[level](scope)                    // hook FIRST
      autoload(modules, matchFilter=/<level>/)  // then that level's routes only
    })
```

| Level | Hook | What it enforces |
| --- | --- | --- |
| `public` | `publicHook` (`roles/public/hook.ts:9`) | nothing — *intentionally empty*, documented |
| `user` | `userHook` → `authenticatedHook` | `verifyToken` (preValidation) + `enforcePermissions` (preHandler) |
| `admin` | `adminHook` → `authenticatedHook` | same |
| `external` | `externalHook` | `verifyApiKey` (onRequest) + `enforceApiScopes` (preHandler) |

`src/services/roles/shared/enforce-permissions.ts:14-23`:

```ts
fastify.addHook("preHandler", async (request) => {
  const required = request.routeOptions?.schema?.permissions;
  if (!required || required.length === 0) return;
  const auth = requireAuth(request);
  if (!hasAnyPermission(auth, required)) throw AppError.forbidden();
});
```

**This is the single strongest asset of the template and must survive into V2 unchanged in spirit.**

Two structural properties make it hard to bypass:
- The hook is registered by the access-level *scope*, not by the route, so a new route file placed
  under `routes/admin/` inherits it automatically.
- The permission list lives in the OpenAPI-bound `schema` object, so it is visible in the contract.

### The one hole in that architecture

`src/app.ts:48` registers a route on the **root instance**, outside every access-level scope:

```ts
app.get("/", async () => ({ data: { status: "ok" } }));
```

The payload is harmless (a static liveness object, no DB, no secrets) and the in-code comment
explains the deploy platform requires it. But architecturally this is a **template escape hatch**:
any route registered on the root instance — by anyone, later — gets no auth hook, no permission hook,
no `public: true` marker, and no schema. It is invisible to any "is every route classified?" check
that only walks `src/modules/`.

*Classification:* `INTERNAL_SYSTEM` (justified), but **structurally unguarded**.
*V2 fix:* a `routes/internal/` access level with an explicit `internalHook`, plus a `check:routes`
script that fails when any `app.<method>` appears outside `src/modules/**/routes/<level>/`.

---

## 2. Statistics

| Metric | Count |
| --- | --- |
| Total endpoints | **307** |
| `PUBLIC_EXPLICIT` | 16 |
| `AUTHENTICATED` (auth-only, no permission) | 14 |
| `PERMISSION_PROTECTED` | 270 |
| `INTERNAL_SYSTEM` (API-key + scopes) | 7 |
| **Unclassified** | **0** |
| **Potentially exposed** | **0** |
| Public routes missing `public: true` | **0** (16/16 carry it) |
| External routes missing `apiScopes` | **0** (7/7 carry it) |
| `GUARD_MANUAL` (manual permission call in a handler) | **0** |
| Routes with no `schema` at all | **0** |
| Routes with no 2xx response schema | 9 (all binary/stream — see `04`) |

### Per-module breakdown

```
module,total,permission_protected,auth_only,public,external,no_response_schema
api,7,0,0,0,7,0
api-keys,3,3,0,0,0,0
audit,1,1,0,0,0,0
audit-log,4,4,0,0,0,1
auth,15,0,8,7,0,0
branches,6,6,0,0,0,0
call-center,20,20,0,0,0,1
capabilities,1,0,0,1,0,0
cities,6,6,0,0,0,0
communication-channels,1,1,0,0,0,0
communication-template-preview,1,1,0,0,0,0
communication-template-variables,1,1,0,0,0,0
communication-template-versions,4,4,0,0,0,0
communication-templates,9,9,0,0,0,0
complaint-notification-settings,2,2,0,0,0,0
complaint-routing-rules,7,7,0,0,0,0
complaint-sla-policies,2,2,0,0,0,0
complaints,16,16,0,0,0,3
customers,8,8,0,0,0,0
dashboard,1,1,0,0,0,0
departments,6,6,0,0,0,0
files,3,3,0,0,0,1
health,2,0,0,2,0,0
imports,12,12,0,0,0,0
integrations,4,4,0,0,0,0
lookups,13,13,0,0,0,0
notifications,7,1,6,0,0,0
permissions,1,1,0,0,0,0
public-surveys,5,0,0,5,0,0
purchase-experiences,4,4,0,0,0,0
regions,6,6,0,0,0,0
report-targets,3,3,0,0,0,0
reports,24,24,0,0,0,2
roles,6,6,0,0,0,0
salespeople,6,6,0,0,0,0
security,1,1,0,0,0,0
settings,4,3,0,1,0,0
survey-campaigns,16,16,0,0,0,0
survey-classification,4,4,0,0,0,0
survey-deliveries,1,1,0,0,0,0
survey-followups,2,2,0,0,0,0
survey-invitations,3,3,0,0,0,0
survey-qr,5,5,0,0,0,0
survey-quick-send,9,9,0,0,0,0
survey-response-analytics,1,1,0,0,0,0
survey-responses,8,8,0,0,0,1
survey-versions,4,4,0,0,0,0
surveys,9,9,0,0,0,0
users,11,11,0,0,0,0
vehicle-models,6,6,0,0,0,0
vehicles,6,6,0,0,0,0
```

---

## 3. The 16 `PUBLIC_EXPLICIT` routes — each justified?

| Route | File:line | Rate limit | Verdict |
| --- | --- | --- | --- |
| `POST /auth/login` | `auth/routes/public/route.ts:21` | `authRateLimit()` 5/60s | justified |
| `POST /auth/refresh` | `:48` | `authRateLimit()` | justified |
| `POST /auth/password-reset-request` | `:70` | `authRateLimit()` | justified |
| `POST /auth/password-reset-confirm` | `:95` | `authRateLimit()` | justified |
| `POST /auth/account-setup` | `:114` | `authRateLimit()` | justified |
| `POST /auth/two-factor/verify` | `public/two-factor/route.ts:26` | `authRateLimit()` | justified |
| `POST /auth/two-factor/recovery` | `:54` | `authRateLimit()` | justified |
| `GET /capabilities` | `capabilities/routes/public/route.ts:9` | global only | justified (safe flags only, `plugins/capabilities.ts:24-29`) |
| `GET /health` | `health/routes/public/route.ts:9` | global only | justified |
| `GET /health/ready` | `:23` | global only | justified (`SELECT 1`, no detail leaked) |
| `GET /settings/public` | `settings/routes/public/route.ts:13` | global only | justified — service filters `isPublic: true, isSecret: false` (`settings.service.ts:61`) |
| `POST /public-surveys/invitations/:token/resolve` | `public-surveys/routes/public/route.ts:21` | **20/60s route-specific** | justified |
| `POST /public-surveys/qr/:publicKey/resolve` | `:38` | **20/60s** | justified |
| `GET /public-surveys/sessions/:sessionToken` | `:55` | **global only** | ⚠ see below |
| `PATCH /public-surveys/sessions/:sessionToken/answers` | `:70` | **global only** | ⚠ see below |
| `POST /public-surveys/sessions/:sessionToken/submit` | `:86` | **global only** | ⚠ see below |

⚠ **`MISSING_ON_SENSITIVE_ENDPOINT`** — the three session routes are unauthenticated, token-bearing,
and *write* survey data, yet only inherit the 100 req/60 s global limit. The two `resolve` routes that
mint the session are correctly limited to 20/60 s; the routes that consume it are not. Detail in
`03 §Rate limiting`.

---

## 4. The 14 `AUTHENTICATED` (permission-less) routes — each justified?

All 14 are "operate on my own record" endpoints, which is exactly the case
`enforce-permissions.ts:10-12` documents as legitimately permission-free.

| Route | File:line | Ownership enforced by |
| --- | --- | --- |
| `GET /auth/me` | `auth/routes/user/route.ts:13` | `auth.me(requireAuth(request).id)` |
| `POST /auth/logout` | `:29` | `logout(sessionId, userId)` — `updateMany where {id, userId}` (`auth.service.ts:177`) |
| `GET /auth/two-factor` | `user/two-factor/route.ts:33` | own user id |
| `POST /auth/two-factor/setup` | `:46` | own user id |
| `POST /auth/two-factor/setup/verify` | `:71` | own user id |
| `POST /auth/two-factor/setup/cancel` | `:99` | own user id |
| `POST /auth/two-factor/disable` | `:121` | own user id |
| `POST /auth/two-factor/recovery-codes` | `:149` | own user id |
| `GET /notifications` | `notifications/routes/user/route.ts:25` | `where { userId: auth.id }` |
| `GET /notifications/unread-count` | `:39` | same |
| `PATCH /notifications/read-all` | `:54` | same |
| `PATCH /notifications/:id/read` | `:74` | same |
| `GET /notifications/preferences` | `:93` | same |
| `PUT /notifications/preferences` | `:108` | same |

Verdict: **`AUTH_ONLY` — justified, 14/14.** No cross-user access found in these handlers.

*But note the classification is implicit.* Nothing in the route metadata says "this is deliberately
self-scoped". A reviewer (or a check script) cannot distinguish "self-scoped by design" from "someone
forgot the permission". V2 must make this explicit — see `16 §check:routes`.

---

## 5. Permission model quality

- **116 permission keys**, single registry: `src/constants/permissions.ts`, auto-seeded
  (`prisma/seed/index.ts`).
- **Naming:** 111 keys are exactly `entity.action`. 6 use three segments and are deliberate
  sub-namespaces: `complaints.escalations.cx_receive`, `complaints.escalations.executive_receive`,
  `reports.executive.read`, `reports.customer_satisfaction.read`, `reports.complaints.read`,
  `reports.call_center.read`. *Minor convention drift, not a defect — but undocumented, so a naming
  check would have to encode the exception.*
- **Semantics:** `hasAnyPermission` = ANY-of (`auth-context.ts:27`). Documented in
  `enforce-permissions.ts:10`. There is **no ALL-of mode**, so a route needing "A and B" cannot
  express it declaratively. Not currently needed; a V2 gap to close (`permissionsAll`).
- **Dynamic permission references:** two routes build the permission from a loop variable —
  `complaints/routes/admin/route.ts:118` (`permissions: [perm]`) and
  `survey-campaigns/routes/admin/route.ts:140` (`permissions: [permission]`). Both resolve to
  `PERMISSIONS.*` constants, so no unregistered key is introduced, but they defeat static analysis:
  a `check:permissions` script cannot verify these two without evaluating the module.

## 6. Role-string comparisons

Grep for `role === "…"`, `roleKeys.includes(…)`, `"admin"`, `"system_admin"` across `src/`:

| Hit | Verdict |
| --- | --- |
| `src/constants/roles.ts:9` — `SYSTEM_ADMIN: "system_admin"` | constant definition, fine |
| `src/modules/api/external-api.service.ts:107` — `roles: { some: { role: { key: "system_admin" } } }` | **data lookup**, not an authorization branch: finds a system user to attribute an external-API-created record to. Not a violation, but it hardcodes the role key instead of using `ROLES.SYSTEM_ADMIN`. |
| `src/modules/complaints/complaints.service.ts:971` | identical pattern, same verdict |

**Authorization-by-role-string violations: 0.** Every access decision goes through permissions.

## 7. Scope / ownership after permission

Permission answers *"may this user do X at all?"*; scope answers *"to which rows?"*. The system does
implement branch scoping, and the shared helper documents the model precisely
(`src/lib/scope/branch-scope.ts:5-19`), including the critical rule that an empty assignment set
matches **nothing** rather than everything.

Adoption is split:

| Uses shared `resolveBranchScope` | Hand-rolled local `resolveScope` |
| --- | --- |
| `customers/communication-timeline.service.ts` | `call-center.service.ts:58` |
| `customers/customer-scope.ts` | `complaints.service.ts:73` |
| `survey-campaigns/campaigns.scope.ts` | `reports.service.ts:34` |
| `survey-quick-send/quick-send.scope.ts` | `survey-responses.service.ts:109` |
| | `customers/communication-timeline.service.ts:167` (`resolveScopes`, plural) |

`branch-scope.ts:20-26` **documents its own bypass** in a comment ("NOTE (duplication, deliberate —
not cleaned up in this pass)"). That honesty is good engineering, but it is exactly the
`SHARED_BYPASSED` pattern V2 must make impossible-by-default rather than opt-in.

The `files` module has **no scope check at all** — see `11`.

## 8. Per-route classification verdicts

| Verdict | Count |
| --- | --- |
| `GUARD_AUTOMATIC` | 270 |
| `AUTH_ONLY` | 14 |
| `PUBLIC_EXPLICIT` | 16 |
| API-key + scope (`INTERNAL_SYSTEM`) | 7 |
| `GUARD_MANUAL` | 0 |
| `UNPROTECTED_VIOLATION` | 0 |

**Answer to "is there an unprotected endpoint?" — No.** The permission architecture worked exactly as
designed across 52 modules and 307 endpoints written largely by agents. That is the template's
strongest evidence of success and the primary thing V2 must not regress.
