export type RoadLiabilityChargeType = "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";

export type CustomerChargeDestination = "RECONCILIATION" | "POST_CLOSE_RECEIVABLE";

export type CustomerChargeReviewState = "NOT_ELIGIBLE" | "AVAILABLE" | "LOCKED";

export interface RoadLiabilityCustomerChargeReviewDto {
  state: CustomerChargeReviewState;
  destination: CustomerChargeDestination | null;
  officialAmount: number;
  currency: string;
  suggestedCustomerChargeAmount: number;
  minimumCustomerChargeAmount: number;
  customerChargeAmount: number | null;
  adjustmentAmount: number | null;
  adjustmentReason: string | null;
  adjustmentNote: string | null;
  confirmedAt: string | null;
  reconciliationLineId: string | null;
  postCloseReceivableId: string | null;
  reasonCode: string | null;
}

export interface ReconciliationRoadLiabilityAvailableDto {
  id: string;
  type: RoadLiabilityChargeType;
  sourceKey: string | null;
  occurredAt: string;
  officialAmount: number;
  currency: string;
  suggestedCustomerChargeAmount: number;
  minimumCustomerChargeAmount: number;
  externalReference: string | null;
  locationLabel: string | null;
  predictedByGps: boolean;
  vehicle: {
    id: number;
    displayName: string;
    plateNumber: string | null;
  } | null;
}

export interface ReconciliationRoadLiabilityAttachedDto {
  roadLiabilityId: string;
  reconciliationLineId: string;
  type: RoadLiabilityChargeType;
  sourceKey: string | null;
  occurredAt: string;
  officialAmount: number;
  customerChargeAmount: number;
  adjustmentAmount: number;
  adjustmentReason: string | null;
  adjustmentNote: string | null;
  locked: true;
}

export interface ReconciliationRoadLiabilitiesDto {
  available: ReconciliationRoadLiabilityAvailableDto[];
  attached: ReconciliationRoadLiabilityAttachedDto[];
}

export interface ConfirmRoadLiabilityChargePayload {
  customerChargeAmount: number;
  adjustmentReason?: string;
  adjustmentNote?: string;
}

export type ChargeReviewUiKind =
  | "loading"
  | "available"
  | "locked"
  | "gps_pending"
  | "unmatched"
  | "ambiguous"
  | "unavailable"
  | "view_only";

export interface ChargeReviewUiState {
  kind: ChargeReviewUiKind;
  destination?: CustomerChargeDestination | null;
  review?: RoadLiabilityCustomerChargeReviewDto;
  available?: ReconciliationRoadLiabilityAvailableDto;
}
