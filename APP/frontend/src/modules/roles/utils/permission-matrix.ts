import type { PermissionDto } from "../types/permission.types";
import type { RoleDto } from "../types/role.types";

/** A permission catalog section: Backend `category`, else the key namespace. */
export interface PermissionGroup {
  key: string;
  permissions: PermissionDto[];
}

/**
 * The render model of the matrix: Backend roles are the columns, Backend
 * permissions (grouped) are the rows. Purely derived — it holds no UI text and
 * never lives in the store.
 */
export interface PermissionMatrix {
  roles: RoleDto[];
  groups: PermissionGroup[];
  /** Total permission rows across all groups. */
  permissionCount: number;
  hasPermission: (roleId: number, permissionKey: string) => boolean;
  /** How many catalog permissions a role holds. */
  permissionCountFor: (roleId: number) => number;
}

/** `vehicles.read` → `vehicles`. Backend `category` wins when present. */
export function resolvePermissionGroup(permission: PermissionDto): string {
  const fromKey = permission.key.split(".")[0];
  return permission.category ?? (fromKey && fromKey.length > 0 ? fromKey : "other");
}

/**
 * The action segment of a key: `vehicles.read` → `read`. A compound key such as
 * `reports.call_center.read` also yields `read` (its subject is carried by a
 * per-permission label override). Empty when the key has no action segment.
 */
export function resolvePermissionAction(permissionKey: string): string {
  const segments = permissionKey.split(".");
  return segments.length > 1 ? (segments.at(-1) ?? "") : "";
}

function groupPermissions(permissions: PermissionDto[]): PermissionGroup[] {
  // Backend order (category asc, key asc) is preserved: groups keep their
  // first-seen order and rows keep their order inside a group.
  const groups = new Map<string, PermissionDto[]>();
  for (const permission of permissions) {
    const groupKey = resolvePermissionGroup(permission);
    const bucket = groups.get(groupKey);
    if (bucket) bucket.push(permission);
    else groups.set(groupKey, [permission]);
  }
  return [...groups].map(([key, groupPermissionsList]) => ({
    key,
    permissions: groupPermissionsList,
  }));
}

/**
 * Builds the matrix once per data change (never inside a render loop).
 * Lookups are O(1) through a `roleId → Set<permissionKey>` index.
 */
export function buildPermissionMatrix(
  roles: RoleDto[],
  permissions: PermissionDto[],
): PermissionMatrix {
  const index = new Map<number, Set<string>>(
    roles.map((role) => [role.id, new Set(role.permissions)]),
  );
  const groups = groupPermissions(permissions);

  return {
    roles,
    groups,
    permissionCount: permissions.length,
    hasPermission: (roleId, permissionKey) =>
      index.get(roleId)?.has(permissionKey) ?? false,
    permissionCountFor: (roleId) => index.get(roleId)?.size ?? 0,
  };
}

export interface MatrixFilter {
  /** Free text matched against the permission key and its resolved label. */
  search: string;
  /** A group key, or `null` for every group. */
  group: string | null;
  /**
   * Resolves the displayed label of a permission. Injected so this module stays
   * pure and free of i18n.
   */
  labelOf: (permission: PermissionDto) => string;
}

/**
 * Local, derived filtering — the whole catalog is already loaded, so no request
 * is made per keystroke. Groups left without a match are dropped, never
 * rendered as an empty header.
 */
export function filterPermissionMatrix(
  matrix: PermissionMatrix,
  filter: MatrixFilter,
): PermissionMatrix {
  const term = filter.search.trim().toLocaleLowerCase();
  const groups = matrix.groups
    .filter((group) => filter.group === null || group.key === filter.group)
    .map((group) => ({
      key: group.key,
      permissions:
        term.length === 0
          ? group.permissions
          : group.permissions.filter(
              (permission) =>
                permission.key.toLocaleLowerCase().includes(term) ||
                filter.labelOf(permission).toLocaleLowerCase().includes(term),
            ),
    }))
    .filter((group) => group.permissions.length > 0);

  return {
    ...matrix,
    groups,
    permissionCount: groups.reduce(
      (total, group) => total + group.permissions.length,
      0,
    ),
  };
}
