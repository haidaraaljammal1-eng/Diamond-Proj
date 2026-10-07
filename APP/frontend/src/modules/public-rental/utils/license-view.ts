import type {
  DrivingLicenseVerificationStatus,
  PublicRentalFlowStep,
} from "../types/public-rental.types";

export type LicensePanelKind =
  | "idle"
  | "verifying"
  | "valid"
  | "expired"
  | "bad_frame"
  | "unreadable"
  | "review"
  | "unavailable";

export type PublicLicenseUnreadableReason = "BAD_FRAME" | "OCR" | null;

export function licensePanelFromStatus(
  status: DrivingLicenseVerificationStatus | null | undefined,
  pending: boolean,
  unreadableReason?: PublicLicenseUnreadableReason,
  clientBadFrame?: boolean,
): LicensePanelKind {
  if (pending) return "verifying";
  if (clientBadFrame) return "bad_frame";
  switch (status) {
    case "VALID":
      return "valid";
    case "EXPIRED":
      return "expired";
    case "UNREADABLE":
      return unreadableReason === "BAD_FRAME" ? "bad_frame" : "unreadable";
    case "REVIEW_REQUIRED":
      return "review";
    case "PROVIDER_UNAVAILABLE":
      return "unavailable";
    default:
      return "idle";
  }
}

export function canContinueFromLicense(
  status: DrivingLicenseVerificationStatus | null | undefined,
  flowStep: PublicRentalFlowStep | null | undefined,
): boolean {
  if (status !== "VALID") return false;
  return (
    flowStep === "CONTRACT" ||
    flowStep === "PAYMENT" ||
    flowStep === "READY_FOR_HANDOVER"
  );
}
