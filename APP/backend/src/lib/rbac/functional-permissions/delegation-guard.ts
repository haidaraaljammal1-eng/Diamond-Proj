import type { AuthUser } from "src/lib/context/auth-context";
import { hasPermission } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import { PERMISSION_CATALOG, type PermissionKey } from "src/constants/permissions";
import type { PrismaClient } from "@prisma/client";
import { isFunctionalCapabilityKey } from "./keys";
import { canPerformFunctionalCapability } from "./policy-engine";
import {
  getNormalizedFunctionalGrants,
  isFunctionalRbacV2Enabled,
} from "./enforcement";

const KNOWN_PERMISSION_KEYS = new Set<PermissionKey>(
  PERMISSION_CATALOG.map((row) => row.key),
);

function functionalAuthContext(actor: AuthUser) {
  return {
    functionalGrants: getNormalizedFunctionalGrants(actor),
    isSystemAdmin: false,
  };
}

/** Reject keys that are not in the synced permission catalog. */
export function assertKnownPermissionKeys(keys: readonly string[]): void {
  for (const key of keys) {
    if (!KNOWN_PERMISSION_KEYS.has(key as PermissionKey)) {
      throw AppError.validation(`Unknown permission: ${key}`);
    }
  }
}

/**
 * When V2 is active, an actor may only persist permission keys they already hold
 * (functional capabilities via policy engine; legacy via effective grants).
 */
export function assertActorMayDelegatePermissionKeys(
  actor: AuthUser,
  keys: readonly string[],
): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (actor.isSystemAdmin) return;

  const unique = [...new Set(keys)];
  assertKnownPermissionKeys(unique);

  const ctx = functionalAuthContext(actor);
  for (const key of unique) {
    if (isFunctionalCapabilityKey(key)) {
      if (!canPerformFunctionalCapability(ctx, key)) {
        throw AppError.forbidden();
      }
    } else if (!hasPermission(actor, key)) {
      throw AppError.forbidden();
    }
  }
}

/** Legacy PUT /permissions must not mutate functional grants when V2 is on. */
export function assertNoFunctionalKeysInLegacyPermissionPayload(
  keys: readonly string[],
): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (keys.some((k) => isFunctionalCapabilityKey(k))) {
    throw AppError.validation(
      "Functional grants must be updated via PUT /admin/roles/:id/functional-grants",
    );
  }
}

/** Assigning a role delegates every permission stored on that role in the database. */
export async function assertActorMayAssignRoles(
  prisma: PrismaClient,
  actor: AuthUser,
  roleIds: readonly number[],
): Promise<void> {
  if (!isFunctionalRbacV2Enabled()) return;
  if (actor.isSystemAdmin) return;
  if (roleIds.length === 0) return;

  const roles = await prisma.role.findMany({
    where: { id: { in: [...new Set(roleIds)] } },
    include: { permissions: { include: { permission: true } } },
  });
  if (roles.length !== new Set(roleIds).size) {
    throw AppError.validation("Role not found");
  }

  const keys = [
    ...new Set(roles.flatMap((r) => r.permissions.map((rp) => rp.permission.key))),
  ];
  assertActorMayDelegatePermissionKeys(actor, keys);
}

export function assertActorMayDeleteRole(actor: AuthUser): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (!actor.isSystemAdmin) {
    throw AppError.forbidden();
  }
}

export function assertActorMayMutateSystemRole(
  actor: AuthUser,
  role: { isSystem: boolean },
): void {
  if (!role.isSystem) return;
  if (!actor.isSystemAdmin) {
    throw AppError.forbidden();
  }
}
