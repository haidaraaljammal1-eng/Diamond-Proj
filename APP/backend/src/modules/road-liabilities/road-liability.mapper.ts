import type {
  ContractStatus,
  Prisma,
  RoadLiabilityAttributionStatus,
  RoadLiabilityCollectionStatus,
  RoadLiabilityConfirmationStatus,
  RoadLiabilityConfidence,
  RoadLiabilityType,
  VehicleOperationalStatus,
} from "@prisma/client";
import { COMPANY_REF_SELECT, type CompanyRef } from "src/modules/operating-companies/company-ref";
import {
  operationalStatusToDto,
  resolvePrimaryImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";
import type {
  RoadLiabilityAttributionDto,
  RoadLiabilityCollectionDto,
  RoadLiabilityConfirmationDto,
  RoadLiabilityConfidenceDto,
  RoadLiabilityDetail,
  RoadLiabilityListItem,
  RoadLiabilityTypeDto,
  RoadLiabilityWorkStateDto,
} from "src/modules/road-liabilities/road-liability.schema";
import type { ChargeableRoadLiability } from "src/modules/road-liabilities/road-liability.types";

const TYPE_TO_DTO: Record<RoadLiabilityType, RoadLiabilityTypeDto> = {
  RTA_VIOLATION: "rta_violation",
  SALIK_TOLL: "salik_toll",
  SALIK_VIOLATION: "salik_violation",
};

const TYPE_FROM_DTO: Record<RoadLiabilityTypeDto, RoadLiabilityType> = {
  rta_violation: "RTA_VIOLATION",
  salik_toll: "SALIK_TOLL",
  salik_violation: "SALIK_VIOLATION",
};

const CONFIRMATION_TO_DTO: Record<RoadLiabilityConfirmationStatus, RoadLiabilityConfirmationDto> = {
  PENDING_CONFIRMATION: "pending_confirmation",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
};

const CONFIRMATION_FROM_DTO: Record<RoadLiabilityConfirmationDto, RoadLiabilityConfirmationStatus> = {
  pending_confirmation: "PENDING_CONFIRMATION",
  confirmed: "CONFIRMED",
  rejected: "REJECTED",
};

const ATTRIBUTION_TO_DTO: Record<RoadLiabilityAttributionStatus, RoadLiabilityAttributionDto> = {
  UNRESOLVED: "unresolved",
  MATCHED: "matched",
  UNMATCHED: "unmatched",
  AMBIGUOUS: "ambiguous",
};

const ATTRIBUTION_FROM_DTO: Record<RoadLiabilityAttributionDto, RoadLiabilityAttributionStatus> = {
  unresolved: "UNRESOLVED",
  matched: "MATCHED",
  unmatched: "UNMATCHED",
  ambiguous: "AMBIGUOUS",
};

const COLLECTION_TO_DTO: Record<RoadLiabilityCollectionStatus, RoadLiabilityCollectionDto> = {
  NOT_READY: "not_ready",
  OPEN: "open",
  SETTLED: "settled",
  DISPUTED: "disputed",
  VOID: "void",
};

const COLLECTION_FROM_DTO: Record<RoadLiabilityCollectionDto, RoadLiabilityCollectionStatus> = {
  not_ready: "NOT_READY",
  open: "OPEN",
  settled: "SETTLED",
  disputed: "DISPUTED",
  void: "VOID",
};

const CONFIDENCE_TO_DTO: Record<RoadLiabilityConfidence, RoadLiabilityConfidenceDto> = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export function roadLiabilityTypeToDto(type: RoadLiabilityType): RoadLiabilityTypeDto {
  return TYPE_TO_DTO[type];
}

export function roadLiabilityTypeFromDto(type: RoadLiabilityTypeDto): RoadLiabilityType {
  return TYPE_FROM_DTO[type];
}

export function confirmationStatusToDto(
  status: RoadLiabilityConfirmationStatus,
): RoadLiabilityConfirmationDto {
  return CONFIRMATION_TO_DTO[status];
}

export function confirmationStatusFromDto(
  status: RoadLiabilityConfirmationDto,
): RoadLiabilityConfirmationStatus {
  return CONFIRMATION_FROM_DTO[status];
}

export function attributionStatusToDto(
  status: RoadLiabilityAttributionStatus,
): RoadLiabilityAttributionDto {
  return ATTRIBUTION_TO_DTO[status];
}

export function attributionStatusFromDto(
  status: RoadLiabilityAttributionDto,
): RoadLiabilityAttributionStatus {
  return ATTRIBUTION_FROM_DTO[status];
}

export function collectionStatusToDto(
  status: RoadLiabilityCollectionStatus,
): RoadLiabilityCollectionDto {
  return COLLECTION_TO_DTO[status];
}

export function collectionStatusFromDto(
  status: RoadLiabilityCollectionDto,
): RoadLiabilityCollectionStatus {
  return COLLECTION_FROM_DTO[status];
}

export function confidenceToDto(
  confidence: RoadLiabilityConfidence | null,
): RoadLiabilityConfidenceDto | null {
  return confidence ? CONFIDENCE_TO_DTO[confidence] : null;
}

/**
 * Eligible for future Reconciliation / Finance collection.
 * GPS predictions never satisfy this: they stay PENDING_CONFIRMATION + NOT_READY.
 */
export type ChargeableRoadLiabilityInput = {
  confirmationStatus: RoadLiabilityConfirmationStatus;
  attributionStatus: RoadLiabilityAttributionStatus;
  attributedContractId: string | null;
  amount: number | null;
  collectionStatus: RoadLiabilityCollectionStatus;
};

export function isChargeableRoadLiability(input: ChargeableRoadLiabilityInput): boolean {
  return (
    input.confirmationStatus === "CONFIRMED" &&
    input.attributionStatus === "MATCHED" &&
    Boolean(input.attributedContractId) &&
    input.amount != null &&
    input.amount > 0 &&
    input.collectionStatus === "OPEN"
  );
}

/**
 * Default customer-charge proposal. Suggested amount is never authoritative
 * until staff confirm. A future pricing policy may change suggested only.
 */
export function buildRoadLiabilityChargeProposal(liability: { amount: number }): {
  officialAmount: number;
  suggestedCustomerChargeAmount: number;
  minimumCustomerChargeAmount: number;
} {
  return {
    officialAmount: liability.amount,
    suggestedCustomerChargeAmount: liability.amount,
    minimumCustomerChargeAmount: liability.amount,
  };
}

/** Read-only staff work queue. Never persisted. */
export type RoadLiabilityWorkState =
  | "AWAITING_CONFIRMATION"
  | "COLLECTIBLE"
  | "NEEDS_CONTRACT"
  | "AMBIGUOUS_MATCH"
  | "ATTRIBUTION_PENDING"
  | "DISPUTED"
  | "SETTLED"
  | "REJECTED"
  | "VOID"
  | "NOT_READY";

const WORK_STATE_TO_DTO: Record<RoadLiabilityWorkState, RoadLiabilityWorkStateDto> = {
  AWAITING_CONFIRMATION: "awaiting_confirmation",
  COLLECTIBLE: "collectible",
  NEEDS_CONTRACT: "needs_contract",
  AMBIGUOUS_MATCH: "ambiguous_match",
  ATTRIBUTION_PENDING: "attribution_pending",
  DISPUTED: "disputed",
  SETTLED: "settled",
  REJECTED: "rejected",
  VOID: "void",
  NOT_READY: "not_ready",
};

export function deriveWorkState(input: ChargeableRoadLiabilityInput): RoadLiabilityWorkState {
  if (input.collectionStatus === "SETTLED") return "SETTLED";
  if (input.collectionStatus === "VOID") return "VOID";
  if (input.confirmationStatus === "REJECTED") return "REJECTED";
  if (input.collectionStatus === "DISPUTED") return "DISPUTED";
  if (input.confirmationStatus === "PENDING_CONFIRMATION") return "AWAITING_CONFIRMATION";
  if (input.attributionStatus === "AMBIGUOUS") return "AMBIGUOUS_MATCH";
  if (input.attributionStatus === "UNMATCHED") return "NEEDS_CONTRACT";
  if (input.attributionStatus === "UNRESOLVED") return "ATTRIBUTION_PENDING";
  if (isChargeableRoadLiability(input)) return "COLLECTIBLE";
  return "NOT_READY";
}

export function workStateToDto(state: RoadLiabilityWorkState): RoadLiabilityWorkStateDto {
  return WORK_STATE_TO_DTO[state];
}

/** Unique liabilities in the Needs Attention queue. */
export const NEEDS_ATTENTION_WHERE: Prisma.RoadLiabilityWhereInput = {
  OR: [
    { collectionStatus: "DISPUTED", confirmationStatus: { not: "REJECTED" } },
    {
      confirmationStatus: "PENDING_CONFIRMATION",
      collectionStatus: { notIn: ["SETTLED", "VOID"] },
    },
    {
      confirmationStatus: "CONFIRMED",
      collectionStatus: { notIn: ["SETTLED", "VOID", "DISPUTED"] },
      attributionStatus: { in: ["AMBIGUOUS", "UNMATCHED", "UNRESOLVED"] },
    },
  ],
};

export const COLLECTIBLE_WHERE: Prisma.RoadLiabilityWhereInput = {
  confirmationStatus: "CONFIRMED",
  attributionStatus: "MATCHED",
  attributedContractId: { not: null },
  amount: { gt: 0 },
  collectionStatus: "OPEN",
};

export const SETTLED_WHERE: Prisma.RoadLiabilityWhereInput = {
  collectionStatus: "SETTLED",
};

export function deriveCollectionStatus(input: {
  confirmationStatus: RoadLiabilityConfirmationStatus;
  attributionStatus: RoadLiabilityAttributionStatus;
  attributedContractId: string | null;
  amount: number | null;
  current?: RoadLiabilityCollectionStatus | null;
}): RoadLiabilityCollectionStatus {
  if (
    input.current === "SETTLED" ||
    input.current === "DISPUTED" ||
    input.current === "VOID"
  ) {
    return input.current;
  }
  if (
    input.confirmationStatus === "CONFIRMED" &&
    input.attributionStatus === "MATCHED" &&
    Boolean(input.attributedContractId) &&
    input.amount != null &&
    input.amount > 0
  ) {
    return "OPEN";
  }
  return "NOT_READY";
}

export function normalizeWholeAedAmount(amount: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount);
}

export const ROAD_LIABILITY_VEHICLE_INCLUDE = {
  model: { select: { name: true } },
  company: { select: COMPANY_REF_SELECT },
  photos: {
    orderBy: [
      { isPrimary: "desc" as const },
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const },
    ],
    include: { attachment: { select: { mimeType: true } } },
  },
} satisfies Prisma.VehicleInclude;

export const ROAD_LIABILITY_LIST_INCLUDE = {
  vehicle: { include: ROAD_LIABILITY_VEHICLE_INCLUDE },
  attributedContract: {
    select: {
      id: true,
      contractNumber: true,
      status: true,
      company: { select: COMPANY_REF_SELECT },
      customer: { select: { name: true } },
    },
  },
  gate: {
    select: {
      id: true,
      networkKey: true,
      nameEn: true,
      nameAr: true,
      externalGateCode: true,
    },
  },
  observations: {
    select: {
      id: true,
      sourceKey: true,
      authoritative: true,
      eventType: true,
      occurredAt: true,
      receivedAt: true,
      confidence: true,
      externalReference: true,
      locationLabel: true,
    },
    orderBy: { receivedAt: "asc" as const },
  },
  reconciliationLine: { select: { id: true } },
  customerCharge: {
    select: {
      destinationType: true,
      reconciliationLineId: true,
      postCloseReceivable: { select: { id: true } },
    },
  },
} satisfies Prisma.RoadLiabilityInclude;

export type RoadLiabilityRow = Prisma.RoadLiabilityGetPayload<{
  include: typeof ROAD_LIABILITY_LIST_INCLUDE;
}>;

type VehicleProjectionRow = {
  id: number;
  vehicleName: string | null;
  plateNumber: string | null;
  modelYear: number | null;
  operationalStatus: VehicleOperationalStatus;
  model: { name: string } | null;
  photos: Array<{
    id: string;
    attachmentId: string;
    sortOrder: number;
    isPrimary: boolean;
    attachment: { mimeType: string };
  }>;
};

function toVehicleProjection(row: VehicleProjectionRow | null): RoadLiabilityListItem["vehicle"] {
  if (!row) return null;
  const image = resolvePrimaryImage(row.id, row.photos);
  return {
    id: row.id,
    displayName: vehicleDisplayName({
      vehicleName: row.vehicleName,
      modelName: row.model?.name ?? null,
      modelYear: row.modelYear,
      plateNumber: row.plateNumber,
    }),
    plateNumber: row.plateNumber,
    primaryImageUrl: image?.url ?? null,
    operationalStatus: operationalStatusToDto(row.operationalStatus),
  };
}

function toContractProjection(
  row: { id: string; contractNumber: string; status: ContractStatus } | null,
): RoadLiabilityListItem["contract"] {
  if (!row) return null;
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
  };
}

/**
 * The one place road-liability company precedence lives.
 *
 * An attributed Contract is frozen history and always wins: a Contract created
 * under ELITE keeps its liabilities ELITE regardless of what the Vehicle reads
 * later. With no Contract the Vehicle answers, which is safe because
 * `Vehicle.companyId` is write-once. With neither, the liability is genuinely
 * unmatched and stays company-less — Diamond never guesses and never falls back
 * to UNIQUE. Salik and RTA share this function; no channel infers its own company.
 */
export function resolveRoadLiabilityCompany(row: {
  attributedContract: { company: CompanyRef } | null;
  vehicle: { company: CompanyRef } | null;
}): CompanyRef | null {
  if (row.attributedContract) return row.attributedContract.company;
  if (row.vehicle) return row.vehicle.company;
  return null;
}

export function toListItem(row: RoadLiabilityRow): RoadLiabilityListItem {
  const gpsObservation = row.observations.find((o) => o.sourceKey === "GPS_INFERENCE");
  return {
    id: row.id,
    type: roadLiabilityTypeToDto(row.type),
    source: row.authoritativeSourceKey,
    occurredAt: row.occurredAt,
    amount: row.amount,
    currency: row.currency,
    confirmationStatus: confirmationStatusToDto(row.confirmationStatus),
    attributionStatus: attributionStatusToDto(row.attributionStatus),
    collectionStatus: collectionStatusToDto(row.collectionStatus),
    workState: workStateToDto(
      deriveWorkState({
        confirmationStatus: row.confirmationStatus,
        attributionStatus: row.attributionStatus,
        attributedContractId: row.attributedContractId,
        amount: row.amount,
        collectionStatus: row.collectionStatus,
      }),
    ),
    locationLabel: row.locationLabel,
    gate: row.gate,
    vehicle: toVehicleProjection(row.vehicle),
    contract: toContractProjection(row.attributedContract),
    company: resolveRoadLiabilityCompany(row),
    customer: row.attributedContract?.customer
      ? { displayName: row.attributedContract.customer.name }
      : null,
    prediction: {
      predictedByGps: Boolean(gpsObservation),
      confidence: confidenceToDto(gpsObservation?.confidence ?? null),
    },
    authoritative: {
      confirmed: row.confirmationStatus === "CONFIRMED",
      externalReference: row.authoritativeExternalReference,
    },
    reconciliationAttached: Boolean(row.reconciliationLine) || row.customerCharge?.destinationType === "RECONCILIATION",
    reconciliationLineId: row.reconciliationLine?.id ?? row.customerCharge?.reconciliationLineId ?? null,
    customerCharge: {
      confirmed: Boolean(row.customerCharge),
      destination: row.customerCharge?.destinationType ?? null,
    },
  };
}

export function toDetail(row: RoadLiabilityRow): RoadLiabilityDetail {
  return {
    ...toListItem(row),
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    provenance: row.observations.map((observation) => ({
      id: observation.id,
      sourceKey: observation.sourceKey,
      authoritative: observation.authoritative,
      eventType: roadLiabilityTypeToDto(observation.eventType),
      occurredAt: observation.occurredAt,
      receivedAt: observation.receivedAt,
      confidence: confidenceToDto(observation.confidence),
      externalReference: observation.externalReference,
      locationLabel: observation.locationLabel,
    })),
  };
}

export function toChargeable(row: {
  id: string;
  type: RoadLiabilityType;
  vehicleId: number | null;
  attributedContractId: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: Date;
  authoritativeSourceKey: string | null;
  confirmationStatus: RoadLiabilityConfirmationStatus;
  attributionStatus: RoadLiabilityAttributionStatus;
  collectionStatus: RoadLiabilityCollectionStatus;
}): ChargeableRoadLiability | null {
  if (
    !isChargeableRoadLiability(row) ||
    row.attributedContractId == null ||
    row.amount == null ||
    !row.currency
  ) {
    return null;
  }
  return {
    id: row.id,
    type: row.type,
    vehicleId: row.vehicleId,
    attributedContractId: row.attributedContractId,
    amount: row.amount,
    currency: row.currency,
    occurredAt: row.occurredAt,
    authoritativeSourceKey: row.authoritativeSourceKey,
    confirmationStatus: row.confirmationStatus,
    attributionStatus: row.attributionStatus,
    collectionStatus: row.collectionStatus,
  };
}
