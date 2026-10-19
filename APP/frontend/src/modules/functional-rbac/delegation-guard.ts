import { isFunctionalCapabilityKey } from "./keys.ts";
import {
  canPerformFunctionalCapability,
  extractFunctionalGrantsFromPermissions,
} from "./policy-engine.ts";
import type { FunctionalAuthContext } from "./types.ts";
import { applyFunctionalGrantToggle } from "./checkbox-transitions.ts";

/**
 * Mirrors Backend `assertActorMayDelegatePermissionKeys` (fail-closed per key).
 */
export function actorMayDelegatePermissionKeys(
  ctx: FunctionalAuthContext,
  keys: readonly string[],
  hasLegacyPermission: (key: string) => boolean,
): boolean {
  if (ctx.isSystemAdmin) return true;
  const unique = [...new Set(keys)];
  for (const key of unique) {
    if (isFunctionalCapabilityKey(key)) {
      if (!canPerformFunctionalCapability(ctx, key)) return false;
    } else if (!hasLegacyPermission(key)) {
      return false;
    }
  }
  return true;
}

/** Proposed role permission keys after a functional matrix toggle (parent/child normalized). */
export function projectedRolePermissionKeysAfterFunctionalToggle(
  rolePermissions: readonly string[],
  capabilityKey: string,
  enabled: boolean,
): string[] {
  const functional = extractFunctionalGrantsFromPermissions(rolePermissions);
  const nextFunctional = applyFunctionalGrantToggle(
    functional,
    capabilityKey,
    enabled,
  );
  const preserved = rolePermissions.filter((key) => !isFunctionalCapabilityKey(key));
  return [...new Set([...preserved, ...nextFunctional])];
}

export function actorMayDelegateFunctionalGrantToggle(
  ctx: FunctionalAuthContext,
  rolePermissions: readonly string[],
  capabilityKey: string,
  enabled: boolean,
  hasLegacyPermission: (key: string) => boolean,
): boolean {
  const merged = projectedRolePermissionKeysAfterFunctionalToggle(
    rolePermissions,
    capabilityKey,
    enabled,
  );
  return actorMayDelegatePermissionKeys(ctx, merged, hasLegacyPermission);
}
