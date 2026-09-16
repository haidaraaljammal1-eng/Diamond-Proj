import type { ApiRequestError } from "@/infrastructure/api/errors";
import type { RoadLiabilityDetailDto } from "../types/road-liabilities.types";
import type {
  ChargeReviewUiState,
  ConfirmRoadLiabilityChargePayload,
  RoadLiabilityCustomerChargeReviewDto,
} from "../types/road-liability-charge-review.types";
import { isGpsPredictionOnly } from "./road-liability-status.ts";

export const CHARGE_REVIEW_REASON_MAX = 200;
export const CHARGE_REVIEW_NOTE_MAX = 2000;

export const CHARGE_REVIEW_REASON_SUGGESTIONS = [
  "administrationFee",
  "processingFee",
  "serviceFee",
  "other",
] as const;

export type ChargeReviewReasonSuggestion = (typeof CHARGE_REVIEW_REASON_SUGGESTIONS)[number];

export function parseWholeAed(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function additionalChargePreview(officialAmount: number, customerChargeAmount: number): number {
  return customerChargeAmount - officialAmount;
}

export function deriveChargeReviewState(input: {
  detail: RoadLiabilityDetailDto | null;
  review: RoadLiabilityCustomerChargeReviewDto | null;
  canCharge: boolean;
  loading: boolean;
}): ChargeReviewUiState {
  const detail = input.detail;
  if (!detail) return { kind: "unavailable" };
  if (isGpsPredictionOnly(detail)) return { kind: "gps_pending" };
  if (detail.attributionStatus === "unmatched") return { kind: "unmatched" };
  if (detail.attributionStatus === "ambiguous") return { kind: "ambiguous" };

  const lockedFromDetail =
    detail.customerCharge?.confirmed || detail.reconciliationAttached
      ? ({
          state: "LOCKED",
          destination:
            detail.customerCharge?.destination ??
            (detail.reconciliationAttached ? "RECONCILIATION" : null),
          officialAmount: detail.amount ?? 0,
          currency: detail.currency ?? "AED",
          suggestedCustomerChargeAmount: detail.amount ?? 0,
          minimumCustomerChargeAmount: detail.amount ?? 0,
          customerChargeAmount: detail.amount,
          adjustmentAmount: 0,
          adjustmentReason: null,
          adjustmentNote: null,
          confirmedAt: detail.confirmedAt ?? null,
          reconciliationLineId: detail.reconciliationLineId ?? null,
          postCloseReceivableId: null,
          reasonCode: null,
        } satisfies RoadLiabilityCustomerChargeReviewDto)
      : null;

  const review = input.review ?? lockedFromDetail;
  if (review?.state === "LOCKED") {
    return { kind: "locked", destination: review.destination, review };
  }
  if (input.loading) return { kind: "loading" };
  if (review?.state === "AVAILABLE") {
    if (!input.canCharge) return { kind: "view_only", destination: review.destination, review };
    return { kind: "available", destination: review.destination, review };
  }
  if (!input.canCharge && detail.workState === "collectible") {
    return { kind: "view_only", destination: review?.destination ?? null, review: review ?? undefined };
  }
  return { kind: "unavailable" };
}

export function validateCustomerCharge(input: {
  officialAmount: number;
  minimumCustomerChargeAmount: number;
  customerChargeAmount: number | null;
  adjustmentReason: string;
}): { customerChargeAmount?: number; field?: "amount" | "reason"; errorKey?: ChargeReviewErrorI18nKey } {
  if (input.customerChargeAmount == null) {
    return { field: "amount", errorKey: "charge.invalidAmount" };
  }
  if (input.customerChargeAmount < input.minimumCustomerChargeAmount) {
    return { field: "amount", errorKey: "charge.belowOfficial" };
  }
  const additional = additionalChargePreview(input.officialAmount, input.customerChargeAmount);
  if (additional > 0 && input.adjustmentReason.trim().length === 0) {
    return { field: "reason", errorKey: "charge.reasonRequired" };
  }
  if (input.adjustmentReason.trim().length > CHARGE_REVIEW_REASON_MAX) {
    return { field: "reason", errorKey: "charge.reasonRequired" };
  }
  return { customerChargeAmount: input.customerChargeAmount };
}

export function buildConfirmChargePayload(input: {
  officialAmount: number;
  customerChargeAmount: number;
  adjustmentReason: string;
  adjustmentNote: string;
}): ConfirmRoadLiabilityChargePayload {
  const additional = additionalChargePreview(input.officialAmount, input.customerChargeAmount);
  const payload: ConfirmRoadLiabilityChargePayload = {
    customerChargeAmount: input.customerChargeAmount,
  };
  if (additional > 0) payload.adjustmentReason = input.adjustmentReason.trim();
  const note = input.adjustmentNote.trim();
  if (note) payload.adjustmentNote = note.slice(0, CHARGE_REVIEW_NOTE_MAX);
  return payload;
}

export type ChargeReviewErrorI18nKey =
  | "charge.generic"
  | "charge.alreadyCharged"
  | "charge.belowOfficial"
  | "charge.reasonRequired"
  | "charge.invalidAmount"
  | "charge.notEligible"
  | "charge.forbidden";

export function chargeReviewErrorKey(error: ApiRequestError | null): ChargeReviewErrorI18nKey {
  if (!error) return "charge.generic";
  const reason = typeof error.context?.reason === "string" ? error.context.reason : "";
  if (reason === "ROAD_LIABILITY_ALREADY_CHARGED") return "charge.alreadyCharged";
  if (reason === "CUSTOMER_CHARGE_BELOW_OFFICIAL") return "charge.belowOfficial";
  if (reason === "ADJUSTMENT_REASON_REQUIRED") return "charge.reasonRequired";
  if (reason === "INVALID_CUSTOMER_CHARGE") return "charge.invalidAmount";
  if (
    reason === "ROAD_LIABILITY_NOT_CHARGEABLE" ||
    reason === "ROAD_LIABILITY_CONTRACT_MISMATCH" ||
    reason === "CONTRACT_INVALID_TRANSITION" ||
    reason === "CONTRACT_CAR_IN_REQUIRED"
  ) {
    return "charge.notEligible";
  }
  if (error.code === "FORBIDDEN") return "charge.forbidden";
  return "charge.generic";
}
