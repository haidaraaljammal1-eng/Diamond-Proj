# Permissions and RBAC

## Model

```
User ──< UserRole >── Role ──< RolePermission >── Permission
```

- A user can hold multiple roles; a role holds multiple permissions.
- Permissions are strings in `resource.action` form (`users.read`). Defined in `src/constants/permissions.ts` and seeded idempotently.

### Catalog sync (development)

After adding keys to `PERMISSION_CATALOG`, run `npm run dev:bootstrap` (or `npm run db:seed`) so the `Permission` and `RolePermission` rows exist. The seed upserts every catalog entry and links all DB permissions to `system_admin`. Verify with `GET /auth/me` and a protected route before testing page guards. The frontend NextAuth session mirrors `/auth/me` on login, access-token refresh, and session revalidation — UX only; Backend DB effective permissions remain the authorization authority. New domain permissions require: Catalog → Seed → RolePermission → `/auth/me` verification → frontend session verification. Do not assume another developer's local database already has the new keys.
- Roles have a stable `key` and an `isSystem` flag. **Business logic must never branch on a role key** — check permissions (or `isSystem`) instead.
- The seeded `system_admin` role holds every permission and cannot be deleted.

## Automatic enforcement (the critical rule)

A protected route declares its requirement in schema metadata:

```ts
schema: { permissions: ["users.create"], /* ... */ }
```

The always-on `enforcePermissions` preHandler (applied by every authenticated access level) reads `schema.permissions` at request time and enforces it. **There is no manual `verifyPermission()` call to write or forget.** Default semantics: the caller needs **any** of the listed permissions.

## Public vs authenticated vs permission-protected

- **Public:** lives under `routes/public/`, sets `public: true`. No auth. This is the *only* way to be public.
- **Authenticated:** under `routes/user|admin/` with no `permissions`. Requires a valid token; no specific permission.
- **Permission-protected:** under an authenticated level with `permissions: [...]`.

Absence of a permission never makes a route public. Every route must be classifiable into exactly one of these three buckets.

## Scope (future-proofing)

The authorization context (`request.auth`) is designed to extend to scopes (tenant / branch / organization) without a rewrite. The starter does not assume multi-tenancy; add scope filters in your domain queries when needed rather than building a fictional isolation layer.

## Guardrails

- Prevent deleting a system role.
- Prevent removing the last account with administrative access (`assertNotRemovingLastAdmin`).
- Suspending a user blocks login and revokes sessions but never cascades to domain entities.
