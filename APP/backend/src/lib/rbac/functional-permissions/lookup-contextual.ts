import type { AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { AppError } from "src/lib/errors/app-error";
import { hasAnyPermission } from "src/lib/context/auth-context";
import { FN } from "./keys";
import {
  hasFunctionalCapability,
  isFunctionalRbacV2Enabled,
} from "./enforcement";

/**
 * Contextual lookup authorization when V2 is enabled. Legacy ANY-of on the route
 * is bypassed — the caller must hold the workflow capability that justified the lookup.
 */
export function assertContextualLookup(
  auth: AuthUser,
  requiredCapability: string,
  legacyAnyOf: readonly string[],
): void {
  if (!isFunctionalRbacV2Enabled()) {
    if (!hasAnyPermission(auth, [...legacyAnyOf])) {
      throw AppError.forbidden();
    }
    return;
  }
  if (auth.isSystemAdmin) return;
  if (!hasFunctionalCapability(auth, requiredCapability)) {
    throw AppError.forbidden();
  }
}

export const LOOKUP_VEHICLE_FOR_MAINTENANCE_CREATE = {
  capability: FN.maintenance.create,
  legacy: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.VEHICLES_READ],
} as const;

export const LOOKUP_ROLES_FOR_USER_ASSIGN = {
  capability: FN.users.assignRoles,
  legacy: [PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_UPDATE],
} as const;
