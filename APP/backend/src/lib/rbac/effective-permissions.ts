import { ALL_PERMISSION_KEYS } from "src/constants/roles";
import { SYSTEM_ROLES } from "src/constants/roles";

type RolePermissionRow = {
  permission: { key: string };
};

export type RoleGrantInput = {
  key: string;
  isSystem: boolean;
  permissions: RolePermissionRow[];
};

/**
 * System roles (e.g. `system_admin`) receive every catalog permission and bypass
 * individual permission denial at authorization time.
 */
export function roleGrantsIncludeSystemAdmin(roles: RoleGrantInput[]): boolean {
  return roles.some(
    (role) => role.isSystem === true || role.key === SYSTEM_ROLES.SYSTEM_ADMIN,
  );
}

export function resolveEffectivePermissions(roles: RoleGrantInput[]): {
  permissions: string[];
  isSystemAdmin: boolean;
} {
  const isSystemAdmin = roleGrantsIncludeSystemAdmin(roles);
  const explicit = [
    ...new Set(roles.flatMap((role) => role.permissions.map((rp) => rp.permission.key))),
  ];
  const permissions = isSystemAdmin ? [...ALL_PERMISSION_KEYS] : explicit;
  return { permissions, isSystemAdmin };
}
