---
name: rbac-permission
description: Use when adding or changing a permission, gating a route, tiering a response by permission, or applying branch/department scope. The backend is the only authority — this skill covers where each check belongs so no route ends up unguarded.
---

# Permissions, RBAC and scope

**The backend is the authority.** Frontend checks are UX only. Absence of a permission
never means public.

## Adding a permission key

`src/constants/permissions.ts` holds both halves — add to both or the seed drifts:

```ts
// 1. the const
ORDERS_READ: "orders.read",

// 2. the catalog entry (category drives the admin UI grouping)
{ key: PERMISSIONS.ORDERS_READ, category: "orders", description: "View orders" },
```

Keys are `resource.action`. Conventional actions: `read`, `create`, `update`, `delete`,
`manage`, `export`, plus scope-widening keys like `view_all_branches` and audience keys
like `<x>.receive`. Seeding is automatic (`prisma/seed/index.ts`) and idempotent.

## Gating a route

Declare it in the route schema. The always-on `enforcePermissions` preHandler enforces
it before the handler runs:

```ts
schema: { summary: "...", operationId: "...", tags: T,
          permissions: [P.ORDERS_READ], response: { 200: ..., ...commonErrorResponses } }
```

- Multiple keys in the array are **any-of** — the caller needs one of them. Use it when
  two different personas legitimately reach the same endpoint.
- **Never** call a permission check by hand inside a handler as the only guard.
- A route is public **only** by living under `routes/public/`.

## Tiering a response

Permission also decides *what a row contains*, not just who reaches it. Resolve the
capability once per request and pass it into the service:

```ts
const includePhone = hasPermission(viewer, P.CALL_CENTER_CONTACTS_READ);
// ... in the projection
customer: customerSummary(c.customer, includePhone),  // masked when false
```

A field the caller may not read comes back `null` or masked — never omitted
inconsistently, and never fetched-then-filtered in the client.

## Branch and department scope

Scope is applied to the **query**, never to the page after the fact, so `meta.total`
and pagination are the scoped truth.

```ts
const scope = await resolveScope(viewer);           // view_all_branches ∨ assignments
const where = { AND: [scopeWhere(scope), userFilter] };
```

- A `?branchId=` filter and the viewer's scope constrain the SAME relation, so combine
  them with `AND` — a spread lets the filter overwrite the scope and leak rows.
- A request may only NARROW scope. A query param can never widen it.
- Department membership (`UserDepartmentAssignment`) drives assignee eligibility and
  escalation audiences; branch membership (`UserBranchAssignment`) drives visibility.
- Shared helpers: `src/lib/scope/branch-scope.ts`, `src/lib/context/auth-context.ts`.

## Audiences

A notification audience is resolved from permissions (who holds
`complaints.escalations.executive_receive`), never from a hardcoded role name. Role keys
are configuration; permission keys are the contract.

## Verifying

- `tests/integration/lookup-permissions.test.ts` is the model for permission-tier tests.
- `tests/integration/security.test.ts` covers the unguarded-route sweep.
- Then run the `verify-done` skill.
