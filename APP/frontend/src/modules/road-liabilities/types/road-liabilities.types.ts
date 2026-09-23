import type { OperatingCompanyIdentity } from "@/modules/operating-companies";

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

/**
 * The owning company the Backend resolved for this liability: the attributed
 * Contract first, then the Vehicle. Optional and nullable on purpose — an
 * unmatched liability has no company, and a stale or simulated payload that omits
 * it must never break the row.
 */
export type RoadLiabilityCompanyDto = OperatingCompanyIdentity;

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
  company?: RoadLiabilityCompanyDto | null;
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
  /** Authoritative company id, or null for All Companies (unmatched rows included). */
  companyId: number | null;
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

export type RoadLiabilityCollectionOperationalState =
  | "collectible"
  | "processing"
  | "paid"
  | "failed"
  | "requires_action"
  | "manual_pending"
  | "payment_link_ready";

export type RoadLiabilityCollectionAuthorizationStatus =
  | "active"
  | "missing"
  | "revoked"
  | "scope_ineligible"
  | "contract_mismatch"
  | "method_inactive"
  | "provider_mismatch";

export interface RoadLiabilitySavedPaymentMethodDto {
  brand: string;
  last4: string;
}

export interface RoadLiabilityCollectionCapabilityDto {
  offSessionAvailable: boolean;
  cashCollectionRequired: boolean;
  authorizationStatus: RoadLiabilityCollectionAuthorizationStatus;
  savedPaymentMethod: RoadLiabilitySavedPaymentMethodDto | null;
  reasonCode: string | null;
}

export interface RoadLiabilityCollectionChargeDto {
  officialAmount: number;
  customerChargeAmount: number;
  currency: string;
  adjustmentAmount: number | null;
  adjustmentReason: string | null;
  contractNumber: string;
  customerName: string | null;
}

export interface RoadLiabilityCollectionViewDto {
  liabilityId: string;
  collectionStatus: RoadLiabilityCollectionStatus;
  operationalState: RoadLiabilityCollectionOperationalState | null;
  capability: RoadLiabilityCollectionCapabilityDto;
  charge: RoadLiabilityCollectionChargeDto | null;
  checkoutUrl: string | null;
}

export interface OffSessionCollectionInput {
  customerChargeAmount?: number;
  adjustmentReason?: string;
  adjustmentNote?: string;
}

export interface RoadLiabilityFailureCustomerDto {
  fullName: string | null;
  nationality: string | null;
  identityNumber: string | null;
  passportNumber: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  issuingCountry: string | null;
  drivingLicenseNumber: string | null;
  drivingLicenseExpiry: string | null;
  telephone: string | null;
  address: string | null;
}

export interface RoadLiabilityCollectionFailureDto {
  liability: {
    id: string;
    source: string | null;
    type: string;
    amount: number | null;
    occurredAt: string;
    externalReference: string | null;
    contractNumber: string | null;
    vehicleLabel: string | null;
    plateNumber: string | null;
  };
  customer: RoadLiabilityFailureCustomerDto;
  savedCard: RoadLiabilitySavedPaymentMethodDto | null;
  failure: {
    reasonCode: string;
    messageEn: string;
    messageAr: string;
    declineCode: string | null;
    occurredAt: string;
  };
}

export interface OffSessionCollectionResultDto {
  status: "succeeded" | "failed" | "requires_action" | "processing";
  operationalState: RoadLiabilityCollectionOperationalState;
  failure: RoadLiabilityCollectionFailureDto | null;
}

export interface ManualCollectionConfirmInput {
  amount: number;
  method?: string;
  note?: string;
}

export interface RoadLiabilityPaymentLinkResultDto {
  checkoutUrl: string | null;
  paymentId: string;
}
