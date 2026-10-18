import type {
  RoadLiabilityCollectionFailureDto,
  StaffRoadChargeCategory,
} from "../../types/road-liabilities.types";

export const STAFF_CHARGE_SUCCESS_CLOSE_MS = 2000;

export type StaffChargeOutcomeStatus =
  | "succeeded"
  | "processing"
  | "failed"
  | "requires_action"
  | "blocked";

export function parseWholeAed(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function parseStaffChargeReference(referenceRaw: string): string {
  return referenceRaw.trim();
}

export function isStaffChargeReferenceValid(referenceRaw: string): boolean {
  return parseStaffChargeReference(referenceRaw).length > 0;
}

export function shouldAutoCloseStaffChargeDialog(status: StaffChargeOutcomeStatus): boolean {
  return status === "succeeded";
}

export function shouldClearStaffChargeInputsAfterOutcome(status: StaffChargeOutcomeStatus): boolean {
  return status === "failed";
}

export function resolveStaffChargeFailureMessage(
  locale: string,
  failure: RoadLiabilityCollectionFailureDto | null | undefined,
): string | null {
  if (!failure) return null;
  if (locale.startsWith("ar") && failure.messageAr) return failure.messageAr;
  if (failure.messageEn) return failure.messageEn;
  return null;
}

export type StaffChargeRecoveryState =
  | "none"
  | "orphan_idempotency_cleared"
  | "collection_resumed"
  | "awaiting_provider"
  | "manual_review";

export function staffChargeOutcomeMessageKey(
  status: StaffChargeOutcomeStatus,
  recoveryState?: StaffChargeRecoveryState,
): "resultSuccessTraffic" | "resultSuccessSalik" | "resultProcessing" | "resultRequiresAction" | "resultFailed" | "resultManualReview" | "resultAwaitingProvider" | null {
  if (status === "succeeded") return null;
  if (status === "processing") {
    return recoveryState === "awaiting_provider" ? "resultAwaitingProvider" : "resultProcessing";
  }
  if (status === "requires_action") return "resultRequiresAction";
  if (status === "blocked" || recoveryState === "manual_review") return "resultManualReview";
  if (status === "failed") return "resultFailed";
  return null;
}

export function shouldShowSuccessHighlight(status: StaffChargeOutcomeStatus): boolean {
  return status === "succeeded";
}

export function staffChargeSuccessMessageKey(
  category: StaffRoadChargeCategory,
): "resultSuccessTraffic" | "resultSuccessSalik" {
  return category === "TRAFFIC_VIOLATION" ? "resultSuccessTraffic" : "resultSuccessSalik";
}

export function staffChargeReferenceLabelKey(
  category: StaffRoadChargeCategory,
): "referenceLabelTraffic" | "referenceLabelSalik" {
  return category === "SALIK" ? "referenceLabelSalik" : "referenceLabelTraffic";
}

export function staffChargeReferenceRequiredKey(
  category: StaffRoadChargeCategory,
): "referenceRequiredTraffic" | "referenceRequiredSalik" {
  return category === "SALIK" ? "referenceRequiredSalik" : "referenceRequiredTraffic";
}

export function isStaffChargeSuccessPendingClose(
  successHighlight: boolean,
  resultMessage: string | null,
): boolean {
  return successHighlight && resultMessage != null && resultMessage.length > 0;
}

export function createStaffChargeDialogResetState() {
  return {
    category: "TRAFFIC_VIOLATION" as StaffRoadChargeCategory,
    referenceRaw: "",
    amountRaw: "",
    confirming: false,
    submitting: false,
    error: null as null,
    resultMessage: null as string | null,
    successHighlight: false,
    referenceError: null as string | null,
  };
}
