/**
 * Roles & Permissions domain public API.
 *
 * Pages import the screen and, when they need the data, the domain hook —
 * never the store or the API adapters.
 */
export { RolesScreen } from "./components/roles-screen";
export { useRolesPermissions } from "./hooks/use-roles-permissions";
export {
  ROLES_PAGE_PERMISSIONS,
  ROLES_READ_PERMISSION,
  PERMISSIONS_READ_PERMISSION,
} from "./roles.permissions";
export type { RoleDto } from "./types/role.types";
export type { PermissionDto } from "./types/permission.types";
