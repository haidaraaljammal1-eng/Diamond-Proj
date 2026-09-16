import type {
  PublicRentalFlowStep,
  PublicRentalUiStage,
} from "../types/public-rental.types";

export function uiStageFromFlowStep(
  step: PublicRentalFlowStep,
): PublicRentalUiStage {
  switch (step) {
    case "LICENSE_VERIFICATION":
      return "license";
    case "CONTRACT":
      return "contract";
    case "PAYMENT":
      return "payment";
    case "READY_FOR_HANDOVER":
      return "handover";
  }
}

/** Highest stage the customer may view. Earlier stages stay read-only. */
export function stageRank(stage: PublicRentalUiStage): number {
  switch (stage) {
    case "license":
      return 0;
    case "contract":
      return 1;
    case "payment":
      return 2;
    case "handover":
      return 3;
  }
}

export function canEnterStage(
  requested: PublicRentalUiStage,
  allowed: PublicRentalUiStage,
): boolean {
  return stageRank(requested) <= stageRank(allowed);
}

export function progressIndex(step: PublicRentalFlowStep): number {
  switch (step) {
    case "LICENSE_VERIFICATION":
      return 0;
    case "CONTRACT":
      return 1;
    case "PAYMENT":
    case "READY_FOR_HANDOVER":
      return 2;
  }
}

export const LINK_GONE_REASONS = [
  "CONTRACT_LINK_INVALID",
  "CONTRACT_LINK_EXPIRED",
  "CONTRACT_LINK_USED",
] as const;

export function isLinkGoneReason(reason: string | null | undefined): boolean {
  return (
    reason === "CONTRACT_LINK_INVALID" ||
    reason === "CONTRACT_LINK_EXPIRED" ||
    reason === "CONTRACT_LINK_USED"
  );
}
