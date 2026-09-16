export type RoadLiabilityType =
  | "rta_violation"
  | "salik_toll"
  | "salik_violation";

export type RoadLiabilityConfirmationStatus =
  | "pending_confirmation"
  | "confirmed"
  | "rejected";

export type RoadLiabilityAttributionStatus =
  | "unresolved"
  | "matched"
  | "unmatched"
  | "ambiguous";

export type RoadLiabilityCollectionStatus =
  | "not_ready"
  | "open"
  | "settled"
  | "disputed"
  | "void";

export type RoadLiabilityWorkState =
  | "awaiting_confirmation"
  | "collectible"
  | "needs_contract"
  | "ambiguous_match"
  | "attribution_pending"
  | "disputed"
  | "settled"
  | "rejected"
  | "void"
  | "not_ready";

export type RoadLiabilityConfidence = "high" | "medium" | "low";

export type RoadLiabilityTypeFilter = "all" | RoadLiabilityType;
export type RoadLiabilitySourceFilter = "all" | "RTA" | "SALIK" | "GPS_INFERENCE";
export type RoadLiabilityConfirmationFilter = "all" | RoadLiabilityConfirmationStatus;
export type RoadLiabilityAttributionFilter = "all" | RoadLiabilityAttributionStatus;
export type RoadLiabilityCollectionFilter = "all" | RoadLiabilityCollectionStatus;
export type RoadLiabilityQueueFilter = "all" | "collectible" | "needs_attention" | "settled";
export type RoadLiabilityChannelFilter = "all" | "RTA" | "SALIK";
export type RoadLiabilityAuthority = "RTA" | "SALIK";

export const ROAD_LIABILITY_TYPES: RoadLiabilityType[] = [
  "rta_violation",
  "salik_toll",
  "salik_violation",
];

export const ROAD_LIABILITY_SOURCES: Exclude<RoadLiabilitySourceFilter, "all">[] = [
  "RTA",
  "SALIK",
  "GPS_INFERENCE",
];

export const ROAD_LIABILITY_CONFIRMATIONS: RoadLiabilityConfirmationStatus[] = [
  "pending_confirmation",
  "confirmed",
  "rejected",
];

export const ROAD_LIABILITY_ATTRIBUTIONS: RoadLiabilityAttributionStatus[] = [
  "matched",
  "unmatched",
  "ambiguous",
  "unresolved",
];

export const ROAD_LIABILITY_COLLECTIONS: RoadLiabilityCollectionStatus[] = [
  "not_ready",
  "open",
  "settled",
  "disputed",
  "void",
];

export const ROAD_LIABILITY_QUEUES: Exclude<RoadLiabilityQueueFilter, "all">[] = [
  "collectible",
  "needs_attention",
  "settled",
];

export const ROAD_LIABILITY_CHANNELS: Exclude<RoadLiabilityChannelFilter, "all">[] = [
  "RTA",
  "SALIK",
];

export const NEEDS_ATTENTION_WORK_STATES: RoadLiabilityWorkState[] = [
  "awaiting_confirmation",
  "needs_contract",
  "ambiguous_match",
  "attribution_pending",
  "disputed",
];

export const ROAD_LIABILITIES_PAGE_SIZE = 20;

export interface RoadLiabilityVehicleDto {
  id: number;
  displayName: string;
  plateNumber: string | null;
  primaryImageUrl: string | null;
  operationalStatus: "available" | "rented" | "service";
}

export interface RoadLiabilityContractDto {
  id: string;
  contractNumber: string;
  status: string;
}

export interface RoadLiabilityCustomerDto {
  displayName: string;
}

export interface RoadLiabilityGateDto {
  id: string;
  networkKey: string;
  nameEn: string;
  nameAr: string;
  externalGateCode: string | null;
}

export interface RoadLiabilityListItemDto {
  id: string;
  type: RoadLiabilityType;
  source: string | null;
  occurredAt: string;
  amount: number | null;
  currency: string | null;
  confirmationStatus: RoadLiabilityConfirmationStatus;
  attributionStatus: RoadLiabilityAttributionStatus;
  collectionStatus: RoadLiabilityCollectionStatus;
  workState: RoadLiabilityWorkState;
  locationLabel: string | null;
  gate: RoadLiabilityGateDto | null;
  vehicle: RoadLiabilityVehicleDto | null;
  contract: RoadLiabilityContractDto | null;
  customer: RoadLiabilityCustomerDto | null;
  prediction: {
    predictedByGps: boolean;
    confidence: RoadLiabilityConfidence | null;
  };
  authoritative: {
    confirmed: boolean;
    externalReference: string | null;
  };
  reconciliationAttached?: boolean;
  reconciliationLineId?: string | null;
  customerCharge?: {
    confirmed: boolean;
    destination: "RECONCILIATION" | "POST_CLOSE_RECEIVABLE" | null;
  };
}

export interface RoadLiabilityProvenanceDto {
  id: string;
  sourceKey: string;
  authoritative: boolean;
  eventType: RoadLiabilityType;
  occurredAt: string;
  receivedAt: string;
  confidence: RoadLiabilityConfidence | null;
  externalReference: string | null;
  locationLabel: string | null;
}

export interface RoadLiabilityDetailDto extends RoadLiabilityListItemDto {
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  provenance: RoadLiabilityProvenanceDto[];
}

export interface RoadLiabilitySummaryDto {
  total: number;
  pendingConfirmationCount: number;
  confirmedOpenCount: number;
  confirmedOpenAmount: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  settledCount: number;
  needsAttentionCount: number;
  byType: {
    rtaViolations: number;
    salikTolls: number;
    salikViolations: number;
  };
  providers: {
    rtaConfigured: boolean;
    salikConfigured: boolean;
    tarsTrafficCapabilityVerified: boolean;
  };
}

export interface RoadLiabilityPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RoadLiabilitiesListQuery {
  search: string;
  queue: RoadLiabilityQueueFilter;
  channel: RoadLiabilityChannelFilter;
  type: RoadLiabilityTypeFilter;
  sourceKey: RoadLiabilitySourceFilter;
  confirmationStatus: RoadLiabilityConfirmationFilter;
  attributionStatus: RoadLiabilityAttributionFilter;
  collectionStatus: RoadLiabilityCollectionFilter;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}
