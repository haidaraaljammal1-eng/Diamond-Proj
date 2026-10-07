import type { PublicRentalContext } from "../types/public-rental.types";

export type DocumentVerificationSubStage = "LICENSE" | "PASSPORT" | "RENTER_DETAILS";

function passportNumberReady(context: PublicRentalContext): boolean {
  const status = context.identity?.passport.status;
  const number = context.identity?.passport.fields?.passportNumber?.trim() ?? "";
  return status === "READY" && number.length >= 3;
}

/**
 * Stage-1 internal sequence inside Document Verification.
 * Derived from public rental context only (refresh-safe).
 */
export function resolveDocumentVerificationSubStage(
  context: PublicRentalContext,
): DocumentVerificationSubStage {
  if (context.flow.step !== "LICENSE_VERIFICATION") {
    return "RENTER_DETAILS";
  }

  if (context.licenseVerification.status !== "VALID") {
    return "LICENSE";
  }

  if (!passportNumberReady(context)) {
    return "PASSPORT";
  }

  return "RENTER_DETAILS";
}

export function isPassportSubStageUnlocked(context: PublicRentalContext): boolean {
  return context.licenseVerification.status === "VALID";
}
