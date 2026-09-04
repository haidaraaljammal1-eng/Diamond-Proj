import { PERMISSIONS, type PermissionKey } from "src/constants/permissions";

/**
 * Stable role keys. Business logic must NEVER branch on these strings — check
 * permissions (or `Role.isSystem`) instead. The starter ships a single system
 * role that holds every generic permission.
 */
export const SYSTEM_ROLES = {
  SYSTEM_ADMIN: "system_admin",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export interface SystemRoleDefinition {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[] | "*";
}

export const SYSTEM_ROLE_CATALOG: SystemRoleDefinition[] = [
  {
    key: SYSTEM_ROLES.SYSTEM_ADMIN,
    name: "مدير النظام",
    description: "Full administrative access to all generic modules.",
    permissions: "*", // all permissions in PERMISSION_CATALOG
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);
