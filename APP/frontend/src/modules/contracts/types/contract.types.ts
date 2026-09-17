import type { DamageMark } from "@/modules/public-rental/types/official-contract.types";

export type ContractStatus =
  | "AWAITING"
  | "FORM"
  | "SIGNED"
  | "PAID"
  | "ACTIVE"
  | "RETOUT"
  | "REVIEW"
  | "CLOSED";

export type ContractStatusFilter = "all" | ContractStatus;

export type ContractPriceType = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";

export type ContractLinkType = "RENTAL" | "RETURN" | "RENEWAL";

export type ContractPaymentMethod = "BANK_TRANSFER" | "CARD" | "MANUAL";

export type ContractPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export type ReconciliationLineType =
  | "DAMAGE"
  | "FUEL"
  | "LATE"
  | "SALIK"
  | "VIOLATION"
  | "OTHER";

export type InspectionAngle =
  | "FRONT"
  | "REAR"
  | "RIGHT_SIDE"
  | "LEFT_SIDE"
  | "FRONT_PLATE"
  | "REAR_PLATE"
  | "INTERIOR_ODOMETER"
  | "TIRES";

export type FuelLevel = "F" | "7/8" | "3/4" | "5/8" | "1/2" | "3/8" | "1/4" | "1/8" | "E";

export type ContractSortKey =
  | "newest"
  | "oldest"
  | "amountDesc"
  | "amountAsc"
  | "startAt"
  | "number";

export interface ContractListItemDto {
  id: string;
  contractNumber: string;
  status: ContractStatus;
  vehicleId: number;
  vehicleName: string;
  plateNumber: string | null;
  customerId: number | null;
  customerName: string | null;
  priceType: ContractPriceType;
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  hasSalikGpsSignal: boolean;
}

export interface ContractActionsDto {
  canGenerateRentalLink: boolean;
  canConfirmPayment: boolean;
  canCarOut: boolean;
  canGenerateReturnLink: boolean;
  canCarIn: boolean;
  canReconcile: boolean;
  canClose: boolean;
  canRenew: boolean;
}

export interface ContractVehicleRefDto {
  id: number;
  displayName: string;
  plateNumber: string | null;
  operationalStatus: string;
}

export interface ContractCustomerRefDto {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
}

export interface ContractPaymentDto {
  id: string;
  amount: number;
  currency: string;
  method: ContractPaymentMethod;
  status: ContractPaymentStatus;
  confirmedAt: string | null;
}

export interface ContractInspectionPhotoDto {
  id: string;
  attachmentId: string;
  angle: InspectionAngle;
  url: string;
}

export interface ContractCarOutDto {
  id: string;
  occurredAt: string;
  mileageOut: number;
  fuelOut: string;
  notes: string | null;
  photos: ContractInspectionPhotoDto[];
}

export interface ContractCarInDto {
  id: string;
  occurredAt: string;
  mileageIn: number;
  fuelIn: string;
  notes: string | null;
  photos: ContractInspectionPhotoDto[];
}

export interface ContractReconciliationLineDto {
  id: string;
  type: ReconciliationLineType;
  description: string;
  amount: number;
  externalReference: string | null;
  sourceDomain: string | null;
}

export interface ContractReconciliationDto {
  id: string;
  chargesTotal: number;
  finalAmount: number;
  approvedAt: string | null;
  settledAt?: string | null;
  settled?: boolean;
  lines: ContractReconciliationLineDto[];
}

export interface ContractRenewalDto {
  id: string;
  additionalDays: number;
  additionalAmount: number;
  previousEndAt: string;
  newEndAt: string;
  createdAt: string;
  approvedAt: string | null;
  appliedAt?: string | null;
  awaitingPayment?: boolean;
}

export interface ContractRoadLiabilitySignalsDto {
  hasSalikGpsSignal: boolean;
  salikGpsSignalCount: number;
  unconfirmedSalikGpsSignalCount: number;
  latestSalikGpsSignalAt: string | null;
}

export interface ContractPostCloseReceivableItemDto {
  id: string;
  amount: number;
  currency: string;
  status: "OPEN" | "SETTLED" | "VOID";
  settledAt?: string | null;
  roadLiabilityType: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
  createdAt: string;
}

export interface ContractPostCloseReceivablesSummaryDto {
  count: number;
  openAmount: number;
  items: ContractPostCloseReceivableItemDto[];
}

export interface ContractDetailDto {
  id: string;
  contractNumber: string;
  status: ContractStatus;
  vehicleId: number;
  customerId: number | null;
  createdByUserId: number;
  assignedEmployeeUserId: number | null;
  priceType: ContractPriceType;
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  termsVersion: string;
  snapshot: unknown;
  activatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle: ContractVehicleRefDto;
  customer: ContractCustomerRefDto | null;
  payment: ContractPaymentDto | null;
  carOut: ContractCarOutDto | null;
  carIn: ContractCarInDto | null;
  reconciliation: ContractReconciliationDto | null;
  renewals: ContractRenewalDto[];
  actions: ContractActionsDto;
  roadLiabilitySignals: ContractRoadLiabilitySignalsDto;
  postCloseReceivables: ContractPostCloseReceivablesSummaryDto;
}

export interface CreateContractOfferPayload {
  vehicleId: number;
  priceType: ContractPriceType;
  rentalDays: number;
  agreedAmount: number;
  startAt?: string;
  endAt?: string;
  customerId?: number;
}

export interface ConfirmContractPaymentPayload {
  amount?: number;
  method: ContractPaymentMethod;
  externalReference?: string;
}

export interface InspectionPhotoInput {
  attachmentId: string;
  angle: InspectionAngle;
}

/** Official-contract paper side of a custody event (damage marks + hirer signature PNG). */
export interface CustodyPaperInput {
  damage?: DamageMark[];
  hirerSignatureAttachmentId?: string;
}

export interface CarOutPayload extends CustodyPaperInput {
  occurredAt?: string;
  mileageOut: number;
  fuelOut: FuelLevel;
  notes?: string;
  photos: InspectionPhotoInput[];
}

export interface CarInPayload extends CustodyPaperInput {
  occurredAt?: string;
  mileageIn: number;
  fuelIn: FuelLevel;
  notes?: string;
  photos: InspectionPhotoInput[];
}

export interface ReconciliationLineInput {
  type: ReconciliationLineType;
  description: string;
  amount: number;
  externalReference?: string | null;
}

export interface ReconcilePayload {
  lines: ReconciliationLineInput[];
}

export interface RenewPayload {
  additionalDays: number;
  additionalAmount: number;
}

export interface ContractLinkIssuedDto {
  contractId: string;
  contractNumber: string;
  link: {
    token: string;
    expiresAt: string;
    type: ContractLinkType;
  };
}

/** Runtime-only issued link. Never persist the raw token. */
export interface IssuedContractLinkView {
  contractId: string;
  contractNumber: string;
  type: ContractLinkType;
  url: string;
  expiresAt: string;
}

export interface ContractFiltersState {
  status: ContractStatusFilter;
  search: string;
  from: string;
  to: string;
  sort: ContractSortKey;
}

export interface ContractsListQuery extends Partial<ContractFiltersState> {
  page?: number;
  pageSize?: number;
  vehicleId?: number;
  customerId?: number;
}
