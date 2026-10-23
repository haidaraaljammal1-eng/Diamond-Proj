import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import { FN } from "./keys";
import {
  assertFunctionalRouteAuthorization,
  isFunctionalRbacV2Enabled,
} from "./enforcement";

const MEDIA_MUTATION_REQUIREMENT = {
  keys: [FN.vehicles.addDelete],
  requireAll: true,
};

/** Defense-in-depth for vehicle gallery mutations when RBAC V2 is enabled. */
export function assertVehicleMediaMutationAuthorized(auth: AuthUser): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (auth.isSystemAdmin) return;
  try {
    assertFunctionalRouteAuthorization(auth, MEDIA_MUTATION_REQUIREMENT);
  } catch {
    throw AppError.forbidden();
  }
}
