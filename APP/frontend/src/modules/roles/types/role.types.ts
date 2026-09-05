/**
 * Role DTOs — mirror the Backend `GET /roles` response
 * (`RolePublicSchema` in `APP/backend/src/modules/roles/roles.schema.ts`).
 *
 * `createdAt` / `updatedAt` are Dates in the Backend and arrive as ISO strings
 * over JSON, so they are typed as strings here.
 */
export interface RoleDto {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Permission keys granted to the role — Backend is the authority. */
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}
