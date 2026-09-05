/**
 * Backend permissions the Roles page consumes. Both are real catalog entries
 * (`APP/backend/src/constants/permissions.ts`) — nothing is invented here.
 *
 * - `roles.read`       → `GET /roles`       (the matrix columns)
 * - `permissions.read` → `GET /permissions` (the matrix rows: the full catalog,
 *   including permissions no role holds yet)
 *
 * Frontend visibility is UX only; the Backend remains the authorization
 * authority on every request.
 */
export const ROLES_READ_PERMISSION = "roles.read";
export const PERMISSIONS_READ_PERMISSION = "permissions.read";
/** Create/update a role — `POST /roles`, `PUT /roles/:id`. */
export const ROLES_MANAGE_PERMISSION = "roles.manage";

export const ROLES_PAGE_PERMISSIONS = [
  ROLES_READ_PERMISSION,
  PERMISSIONS_READ_PERMISSION,
] as const;
