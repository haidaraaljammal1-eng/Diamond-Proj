import type { NavigationGroup, NavigationItem } from "../navigation.types";

/**
 * Rail visibility.
 *
 * Declared Backend permissions are required — they are not a bonus on top of
 * the Demo `adminOnly` heuristic. Items with no catalog permission still use
 * `adminOnly` / `system_admin` the way the Demo rail does.
 */
export function isNavigationItemVisible(
  item: NavigationItem,
  group: NavigationGroup,
  hasPermission: (permission: string) => boolean,
  isAdmin: boolean,
): boolean {
  const required = [
    ...(item.permission ? [item.permission] : []),
    ...(item.permissions ?? []),
  ];
  if (required.length > 0) return required.every(hasPermission);
  return (!item.adminOnly && !group.adminOnly) || isAdmin;
}
