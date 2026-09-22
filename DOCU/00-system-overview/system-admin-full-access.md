# System admin full access

Diamond distinguishes two authorization audiences:

| Audience | Rule |
| -------- | ---- |
| **System admin** (`system_admin`, `Role.isSystem = true`) | Full access to every current and future catalog permission |
| **Employees** | Restricted by assigned roles and `RolePermission` rows |

## Central enforcement

Backend (`src/lib/context/auth-context.ts`):

- `isSystemAdmin` is resolved from `Role.isSystem` when the JWT/session identity is built.
- `hasPermission` / `hasAnyPermission` return `true` for system admins before checking explicit grants.
- `/auth/me` expands `permissions` to the full `PERMISSIONS` catalog for system admins (UX mirror).

Frontend (`usePermissions`):

- `hasPermission` returns `true` when the session includes the `system_admin` role key, even if the permission array is stale.

Authentication is still required. Public routes are unchanged.

## Employees

Restricted users continue to need explicit grants. Missing `contracts.read` still blocks Contracts for employees.

## Future permissions

Add a key to `PERMISSION_CATALOG` / `PERMISSIONS`. After deploy:

1. Run `npm run dev:bootstrap` so seed links the permission to `system_admin` in the database.
2. System admins already pass guards through `isSystemAdmin` even before re-login.
3. Employees receive the new permission only when an admin assigns it through Roles.

## Protected system role

`system_admin` cannot be deleted and its permission matrix cannot be edited through the Roles UI (`role.isSystem`).

See also: `APP/backend/docs/engineering-standards/09-PERMISSIONS-AND-RBAC.md`.
