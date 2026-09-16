import type {
  DrivingLicenseVerificationStatus,
  PublicRentalFlowStep,
} from "../types/public-rental.types";

export type LicensePanelKind =
  | "idle"
  | "verifying"
  | "valid"
  | "expired"
  | "unreadable"
  | "review"
  | "unavailable";

export function licensePanelFromStatus(
  status: DrivingLicenseVerificationStatus | null | undefined,
  pending: boolean,
): LicensePanelKind {
  if (pending) return "verifying";
  switch (status) {
    case "VALID":
      return "valid";
    case "EXPIRED":
      return "expired";
    case "UNREADABLE":
      return "unreadable";
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
