/**
 * Permission DTOs — mirror the Backend `GET /permissions` response
 * (`APP/backend/src/modules/permissions/routes/admin/route.ts`).
 *
 * These are frontend DTOs on purpose: the API contract is the boundary, so no
 * Prisma/Zod type is ever imported from the Backend.
 */
export interface PermissionDto {
  id: number;
  /** Stable technical key, `resource.action` (e.g. `vehicles.read`). */
  key: string;
  /** Backend-owned grouping (e.g. `vehicles`). Null for legacy rows. */
  category: string | null;
  description: string | null;
}
