import type {
  DocumentCapturePhase,
  DrivingLicenseVerificationStatus,
  IdentityLicenseStatus,
  PublicPassportStatus,
  PublicRentalFlowStep,
} from "../types/public-rental.types";

/** Mirrors Backend `identityLicenseStatus`. */
export function identityLicenseStatus(
  status: DrivingLicenseVerificationStatus | null | undefined,
): IdentityLicenseStatus {
  if (!status) return "LICENSE_REQUIRED";
  if (status === "VALID") return "LICENSE_VALID";
  if (status === "PENDING") return "LICENSE_PROCESSING";
  return "LICENSE_INVALID";
}

/**
 * Mirrors the Backend identity gate: VALID license AND READY passport.
 * Used only to project normalized overlay state (e.g. demo simulation) into
 * the same shape the Backend returns; real gating stays server-side.
 */
export function deriveIdentityReady(
  licenseStatus: IdentityLicenseStatus,
  passportStatus: PublicPassportStatus | null | undefined,
): boolean {
  return licenseStatus === "LICENSE_VALID" && passportStatus === "READY";
}

export type PassportPanelKind =
  | "locked"
  | "idle"
  | "uploading"
  | "processing"
  | "ready"
  | "notRecognized"
  | "failed"
  | "unavailable";

/**
 * The passport step unlocks only after the backend reports a VALID license.
 * The backend also rejects passport uploads without one; this is presentation.
 */
export function isPassportUnlocked(
  licenseStatus: DrivingLicenseVerificationStatus | null | undefined,
): boolean {
  return licenseStatus === "VALID";
}

export function passportPanelFromState(input: {
  licenseStatus: DrivingLicenseVerificationStatus | null | undefined;
  passportStatus: PublicPassportStatus | null | undefined;
  phase: DocumentCapturePhase;
}): PassportPanelKind {
  if (!isPassportUnlocked(input.licenseStatus)) return "locked";
  if (input.phase === "uploading") return "uploading";
  if (input.phase === "processing") return "processing";
  switch (input.passportStatus) {
    case "PROCESSING":
      return "processing";
    case "READY":
      return "ready";
    case "NOT_RECOGNIZED":
      return "notRecognized";
    case "FAILED":
      return "failed";
    case "PROVIDER_UNAVAILABLE":
      return "unavailable";
    default:
      return "idle";
  }
}

/** Continue to the contract only on backend truth: identityReady and a later server step. */
export function canContinueFromIdentity(
  identityReady: boolean | null | undefined,
  flowStep: PublicRentalFlowStep | null | undefined,
): boolean {
  if (identityReady !== true) return false;
  return (
    flowStep === "CONTRACT" ||
    flowStep === "PAYMENT" ||
    flowStep === "READY_FOR_HANDOVER"
  );
}
