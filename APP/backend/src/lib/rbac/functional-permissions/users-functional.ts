import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import { FN } from "./keys";
import { hasFunctionalCapability, isFunctionalRbacV2Enabled } from "./enforcement";

export function assertFunctionalUserCapability(
  actor: AuthUser,
  capabilityKey: string,
): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (actor.isSystemAdmin) return;
  if (!hasFunctionalCapability(actor, capabilityKey)) {
    throw AppError.forbidden();
  }
}

export function assertFunctionalUserCreate(
  actor: AuthUser,
  roleIds: readonly number[],
): void {
  assertFunctionalUserCapability(actor, FN.users.create);
}
