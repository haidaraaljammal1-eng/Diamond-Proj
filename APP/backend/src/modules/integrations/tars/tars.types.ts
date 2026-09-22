import type {
  ContractInspectionAngle,
  ContractPriceType,
  ContractStatus,
  CustomerType,
} from "@prisma/client";
import type {
  TarsOperationTypeKey,
  TarsOtpUiStatus,
} from "src/modules/integrations/tars/tars.constants";

/**
 * NORMALIZED, DIAMOND-OWNED integration DTOs. A future TarsApiProvider
 * translates these into the official TARS request shape.
 */

export interface TarsContractRef {
  contractId: string;
  contractNumber: string;
  status: ContractStatus;
  termsVersion: string;
}

export interface TarsCompanyRef {
  companyId: number;
  companyCode: string;
}

export interface TarsCustomerData {
  customerId: number;
  name: string;
  type: CustomerType;
  mobile: string | null;
  email: string | null;
  nationality: string | null;
  identityNumber: string | null;
  passportNumber: string | null;
  address: string | null;
}

export interface TarsDrivingLicenseData {
  number: string;
  expiryDate: string | null;
}

export interface TarsVehicleData {
  vehicleId: number;
  displayName: string;
  plateNumber: string | null;
  vin: string | null;
  modelName: string | null;
  modelYear: number | null;
  color: string | null;
  /** Known TARS Vehicle DID when already synced for this company. */
  externalVehicleDid: string | null;
}

export interface TarsRentalData {
  priceType: ContractPriceType;
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  depositAmount: number | null;
  startAt: Date | null;
  endAt: Date | null;
}

/**
 * Provider-neutral upload reference. Future flow: Diamond Attachment → TARS
 * Upload → cached hash/url. No staff streamPath assumption.
 */
export interface TarsUploadRef {
  attachmentId: string;
  angle: ContractInspectionAngle;
  mimeType: string;
  externalUrl: string | null;
  externalHash: string | null;
}

/** @deprecated Legacy attachment ref — use TarsUploadRef for new mappers. */
export interface TarsAttachmentRef {
  attachmentId: string;
  angle: ContractInspectionAngle;
  mimeType: string;
  streamPath: string;
}

export interface TarsCreateRentalInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  customer: TarsCustomerData;
  vehicle: TarsVehicleData;
  rental: TarsRentalData;
  license: TarsDrivingLicenseData;
}

export interface TarsUpdateRentalInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  rental: TarsRentalData;
  /** renewalId, revision, or other business event identifier. */
  correlationSubject: string;
  externalRentalDid: string | null;
}

export interface TarsReturnRentalInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  returnDocumentation: {
    occurredAt: Date;
    odometer: number;
    fuelLevel: string;
    notes: string | null;
  };
  photos: TarsUploadRef[];
  externalRentalDid: string | null;
}

export interface TarsSettleRentalInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  completion: {
    closedAt: Date | null;
    reconciliation: {
      chargesTotal: number;
      depositAmount: number;
      deductions: number;
      finalAmount: number;
      approvedAt: Date;
    };
  };
  externalRentalDid: string | null;
}

/** Legacy DTOs preserved for historical mapper tests and rows. */
export interface TarsRegisterContractInput {
  contract: TarsContractRef;
  customer: TarsCustomerData;
  vehicle: TarsVehicleData;
  rental: TarsRentalData;
  license: TarsDrivingLicenseData;
}

export interface TarsContractAcceptanceInput {
  contract: TarsContractRef;
  acceptance: {
    acceptedAt: Date;
    termsVersion: string;
    signatureAttachmentId: string | null;
  };
}

export interface TarsHandoverInput {
  contract: TarsContractRef;
  handover: {
    occurredAt: Date;
    odometer: number;
    fuelLevel: string;
    notes: string | null;
  };
  photos: TarsAttachmentRef[];
}

export interface TarsReturnInput {
  contract: TarsContractRef;
  returnDocumentation: {
    occurredAt: Date;
    odometer: number;
    fuelLevel: string;
    notes: string | null;
  };
  photos: TarsAttachmentRef[];
}

export interface TarsCompleteContractInput {
  contract: TarsContractRef;
  completion: {
    closedAt: Date | null;
    reconciliation: {
      chargesTotal: number;
      depositAmount: number;
      deductions: number;
      finalAmount: number;
      approvedAt: Date;
    };
  };
}

export type TarsOperationInput =
  | { operationType: "CREATE_RENTAL"; payload: TarsCreateRentalInput }
  | { operationType: "UPDATE_RENTAL"; payload: TarsUpdateRentalInput }
  | { operationType: "RETURN_RENTAL"; payload: TarsReturnRentalInput }
  | { operationType: "SETTLE_RENTAL"; payload: TarsSettleRentalInput }
  | { operationType: "REGISTER_CONTRACT"; payload: TarsRegisterContractInput }
  | { operationType: "CONTRACT_ACCEPTANCE"; payload: TarsContractAcceptanceInput }
  | { operationType: "HANDOVER"; payload: TarsHandoverInput }
  | { operationType: "RETURN_DOCUMENTATION"; payload: TarsReturnInput }
  | { operationType: "COMPLETE_CONTRACT"; payload: TarsCompleteContractInput };

export interface TarsOtpRequestInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  customerMobile: string;
}

export interface TarsOtpVerifyInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  challengeReference: string;
  /** OTP code from customer — never persisted by Diamond. */
  code: string;
}

export interface TarsOtpRequestResult {
  success: boolean;
  challengeReference?: string;
  maskedDestination?: string;
  expiresAt?: Date;
  resendAvailableAt?: Date;
  otpLength?: number;
  maxAttempts?: number;
  errorCode?: string;
}

export interface TarsOtpVerifyResult {
  success: boolean;
  verifiedAt?: Date;
  errorCode?: string;
}

/**
 * Provider result. HTTP 202 Accepted sets `accepted: true` with
 * `providerRequestId` — that is NOT success. Immediate `success: true` is rare.
 */
export interface TarsProviderResult {
  success?: boolean;
  accepted?: boolean;
  externalContractId?: string;
  externalRentalDid?: string;
  externalReference?: string;
  providerOperationId?: string;
  providerRequestId?: string;
  errorCode?: string;
}

export interface TarsAsyncStatusResult {
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  externalRentalDid?: string;
  externalReference?: string;
  errorCode?: string;
}

/** Uncertain — vehicle identity resolution boundary (no speculative mutation). */
export interface TarsVehicleLookupInput {
  company: TarsCompanyRef;
  vehicle: TarsVehicleData;
}

export interface TarsVehicleIdentityResult {
  success: boolean;
  externalVehicleDid?: string;
  errorCode?: string;
}

export interface TarsDrivingLicenseInquiryInput {
  company: TarsCompanyRef;
  licenseNumber: string;
  nationality?: string | null;
}

export interface TarsDrivingLicenseInquiryResult {
  success: boolean;
  errorCode?: string;
}

export interface TarsUploadAttachmentInput {
  company: TarsCompanyRef;
  attachmentId: string;
  mimeType: string;
}

export interface TarsUploadAttachmentResult {
  success: boolean;
  externalUrl?: string;
  externalHash?: string;
  errorCode?: string;
}

export interface TarsHandoverEvidenceInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  handover: TarsHandoverInput["handover"];
  photos: TarsUploadRef[];
  externalRentalDid: string | null;
}

export interface TarsReturnEvidenceInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  returnDocumentation: TarsReturnRentalInput["returnDocumentation"];
  photos: TarsUploadRef[];
  externalRentalDid: string | null;
}

export interface TarsDigitalAcceptanceInput {
  company: TarsCompanyRef;
  contract: TarsContractRef;
  acceptance: TarsContractAcceptanceInput["acceptance"];
  externalRentalDid: string | null;
}

export interface TarsAuthReadinessResult {
  ready: boolean;
  errorCode?: string;
}

export interface TarsProvider {
  readonly name: string;
  readonly configured: boolean;
  readonly companyCode: string;
  checkAuthReadiness(): Promise<TarsAuthReadinessResult>;
  createRental(input: TarsCreateRentalInput): Promise<TarsProviderResult>;
  updateRental(input: TarsUpdateRentalInput): Promise<TarsProviderResult>;
  returnRental(input: TarsReturnRentalInput): Promise<TarsProviderResult>;
  settleRental(input: TarsSettleRentalInput): Promise<TarsProviderResult>;
  /** Poll authoritative async status for a prior 202 acceptance. */
  getAsyncRequestStatus(providerRequestId: string): Promise<TarsAsyncStatusResult>;
  requestContractOtp(input: TarsOtpRequestInput): Promise<TarsOtpRequestResult>;
  verifyContractOtp(input: TarsOtpVerifyInput): Promise<TarsOtpVerifyResult>;
  /** Uncertain capabilities — prepared boundaries, fail closed until mapped. */
  lookupVehicle(input: TarsVehicleLookupInput): Promise<TarsVehicleIdentityResult>;
  registerVehicleIfRequired(input: TarsVehicleLookupInput): Promise<TarsVehicleIdentityResult>;
  inquireDrivingLicense(
    input: TarsDrivingLicenseInquiryInput,
  ): Promise<TarsDrivingLicenseInquiryResult>;
  uploadAttachment(input: TarsUploadAttachmentInput): Promise<TarsUploadAttachmentResult>;
  submitHandoverEvidence(input: TarsHandoverEvidenceInput): Promise<TarsProviderResult>;
  submitReturnEvidence(input: TarsReturnEvidenceInput): Promise<TarsProviderResult>;
  linkDigitalAcceptance(input: TarsDigitalAcceptanceInput): Promise<TarsProviderResult>;
  /** Legacy capabilities — retained for adapter transition. */
  registerContract(input: TarsRegisterContractInput): Promise<TarsProviderResult>;
  submitContractAcceptance(
    input: TarsContractAcceptanceInput,
  ): Promise<TarsProviderResult>;
  submitHandover(input: TarsHandoverInput): Promise<TarsProviderResult>;
  submitReturn(input: TarsReturnInput): Promise<TarsProviderResult>;
  completeContract(input: TarsCompleteContractInput): Promise<TarsProviderResult>;
}

export type TarsExecutionTerminalStatus = "SUCCEEDED" | "FAILED" | "PENDING_PROVIDER";

export interface TarsExecutionResult {
  operationId: string;
  operationType: TarsOperationTypeKey;
  status: TarsExecutionTerminalStatus;
  attemptNumber: number;
  externalContractId: string | null;
  externalRentalDid: string | null;
  externalReference: string | null;
  providerOperationId: string | null;
  providerRequestId: string | null;
  errorCode: string | null;
}

export interface TarsOtpPublicState {
  providerConfigured: boolean;
  required: boolean;
  /** Diamond-owned UI status — not an official TARS status name. */
  status: TarsOtpUiStatus;
  maskedDestination: string | null;
  resendAvailableAt: Date | null;
  expiresAt: Date | null;
  /** Authoritative from provider when available; null lets the UI stay adaptable. */
  otpLength: number | null;
  attemptsRemaining: number | null;
}
