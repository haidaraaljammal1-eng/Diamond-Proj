---
name: add-module
description: Use when adding a new feature module (routes + service + schema + permissions + locales) to the Haidara backend. Enforces the repo's contract-first, permission-guarded module layout so a new endpoint is never missing a zod schema, a permission key, or a service boundary.
---

# Add a module

A module is one feature folder under `src/modules/<feature>/`. Autoload mounts it;
`routes/` and the access-level folder are stripped from the URL.

```
src/modules/<feature>/
  <feature>.schema.ts     zod request + response contracts (the OpenAPI source of truth)
  <feature>.service.ts    all business logic, all Prisma access
  <feature>.errors.ts     AppError factories with stable `reason` codes
  routes/
    public/route.ts       NO auth  — a route is public ONLY by living here
    user/route.ts         authenticated
    admin/route.ts        authenticated + admin-level permissions
```

## Checklist

Work in this order. Do not skip a step because the endpoint "is simple".

1. **Permissions first.** Add every key to `src/constants/permissions.ts` — both the
   `PERMISSIONS` const and the `PERMISSION_CATALOG` entry (category + description).
   They seed automatically via `prisma/seed/index.ts`. Follow `resource.action`
   (`orders.read`, `orders.manage`, `orders.view_all_branches`).
2. **Schema.** One zod object per request part and per response body. Response
   schemas are exact: a field the service does not return makes the build fail —
   that is the contract working, not a nuisance.
3. **Service.** Takes `FastifyInstance`, returns plain functions. Every Prisma call
   lives here. Multi-step writes go through `withTransaction`; concurrency-sensitive
   sections take `acquireAdvisoryLock`. Never `try/catch` to shape an error response.
4. **Errors.** Throw `AppError` with a stable `code` + `context.reason`. Clients
   branch on `reason`, never on the message text.
5. **Route.** Every route declares `summary`, `operationId`, `tags`, `response`, and
   `permissions: ["resource.action"]`. The always-on `enforcePermissions` preHandler
   does the enforcement — never call a permission check by hand in a handler.
6. **Handler shape.** Validate → delegate to the service → return `{ data }` or
   `{ data, meta }`. A handler that contains business logic is a bug.
7. **Audit.** For any state change, enrich `request.setAudit({ action, entityType,
   entityId })`. Never put secrets, tokens, or note bodies into audit metadata.
8. **Locales.** User-facing text goes through `t(key, { lng })` with the key added to
   BOTH `src/locales/en.ts` and `src/locales/ar.ts`.
9. **Branch scope.** If the entity is branch-bound, resolve the viewer's scope in the
   service (see `src/lib/scope/branch-scope.ts`) and apply it to the QUERY, so
   `meta.total` and pagination are the scoped truth. A query param may only narrow
   scope, never widen it.

## Reference implementations

- Small and complete: `src/modules/departments/`
- Branch-scoped list + export + permission tiering: `src/modules/complaints/`
- Contextual, permission-tiered lookups: `src/modules/lookups/`

## Before saying it is done

Run `npm run typecheck && npm run lint && npm run build`, then invoke the
`verify-done` skill for the full gate.
