import type { ContractStatus, ReconciliationLineType } from "./contract.types";

export interface ReconciliationTotalsDto {
  damages: number;
  fuel: number;
  late: number;
  other: number;
  salik: number;
  violations: number;
  finalAmount: number;
}

export interface ReconciliationImagePairDto {
  angle: string;
  outPhoto: { id: string; url: string } | null;
  inPhoto: { id: string; url: string } | null;
}

export interface ReconciliationCustodyDto {
  mileageOut: number | null;
  mileageIn: number | null;
  mileageDifference: number | null;
  fuelOut: string | null;
  fuelIn: string | null;
  fuelDifference: number | null;
}

export interface ReconciliationLineDto {
  id: string;
  type: ReconciliationLineType;
  description: string;
  amount: number;
  roadLiabilityId: string | null;
  externalReference: string | null;
  officialAmountSnapshot: number | null;
  adjustmentAmount: number | null;
  adjustmentReason: string | null;
}

export type ReconciliationRoadLiabilityType =
  | "RTA_VIOLATION"
  | "SALIK_TOLL"
  | "SALIK_VIOLATION";

export interface ReconciliationRoadLiabilityDto {
  id: string;
  type: ReconciliationRoadLiabilityType;
  occurredAt: string;
  officialAmount: number;
  adminFee: number;
  customerCharge: number;
  collectionStatus: string;
  externalReference: string | null;
  attached: boolean;
  reconciliationLineId: string | null;
}

export interface FullReconciliationReadDto {
  contract: {
    contractId: string;
    contractNumber: string;
    status: ContractStatus;
    vehicle: {
      id: number;
      displayName: string;
      plateNumber: string | null;
    };
  };
  custody: ReconciliationCustodyDto;
  imagePairs: ReconciliationImagePairDto[];
  lines: ReconciliationLineDto[];
  roadLiabilities: {
    attached: ReconciliationRoadLiabilityDto[];
    available: ReconciliationRoadLiabilityDto[];
  };
  totals: ReconciliationTotalsDto;
  reconciliation: {
    id: string;
    approvedAt: string | null;
    finalizedAt: string | null;
    finalizedByUserId: number | null;
    settledAt: string | null;
    settled: boolean;
  };
  paymentLink: {
    active: boolean;
    expiresAt: string | null;
  };
  collection: {
    paymentStatus: string | null;
    paymentMethod: string | null;
  };
}

export interface FinalReconciliationDetailDto {
  custody: ReconciliationCustodyDto;
  imagePairs: ReconciliationImagePairDto[];
  lines: ReconciliationLineDto[];
  totals: ReconciliationTotalsDto;
  settlement: {
    method: string | null;
    paymentId: string | null;
    paymentStatus: string | null;
    settledAt: string | null;
  };
  finalizedAt: string | null;
  finalizedBy: { id: number; name: string } | null;
}

export interface ReconciliationLineInputPayload {
  type: ReconciliationLineType;
  description: string;
  amount: number;
  externalReference?: string | null;
}

export interface ConfirmReconciliationRoadLiabilityPayload {
  customerChargeAmount: number;
  adjustmentReason?: string;
  adjustmentNote?: string;
}

export interface ReconciliationLinkIssuedDto {
  contractId: string;
  contractNumber: string;
  link: {
    token: string;
    expiresAt: string;
    type: "RECONCILIATION";
  };
  publicUrl: string;
  finalAmount: number;
}

export interface PublicReconciliationReadDto {
  contractNumber: string;
  vehicle: {
    displayName: string;
    plateNumber: string | null;
  };
  totals: ReconciliationTotalsDto;
  lines: Array<{
    type: ReconciliationLineType;
    description: string;
    amount: number;
  }>;
  finalAmount: number;
  payment: {
    required: boolean;
    settled: boolean;
    status: string | null;
    method: string | null;
  };
}

export interface ReconciliationPreviewImage {
  id: string;
  url: string;
  angle: string;
  stage: "OUT" | "IN";
}
