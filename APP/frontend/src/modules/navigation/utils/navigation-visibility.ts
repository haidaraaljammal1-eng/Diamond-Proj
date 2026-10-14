import { isFunctionalRbacV2UiEnabled } from "../../functional-rbac/feature-flag.ts";
import { canViewFunctionalPage } from "../../functional-rbac/policy-engine.ts";
import type { FunctionalAuthContext } from "../../functional-rbac/types.ts";
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
  functionalCtx?: FunctionalAuthContext,
): boolean {
  if (isAdmin) return true;

  if (
    isFunctionalRbacV2UiEnabled() &&
    item.functionalPageId &&
    functionalCtx
  ) {
    return canViewFunctionalPage(functionalCtx, item.functionalPageId);
  }

  const required = [
    ...(item.permission ? [item.permission] : []),
    ...(item.permissions ?? []),
  ];
  if (required.length > 0) return required.every(hasPermission);
  return (!item.adminOnly && !group.adminOnly) || isAdmin;
}
