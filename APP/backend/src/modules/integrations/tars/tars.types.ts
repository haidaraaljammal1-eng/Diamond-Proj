import type {
  ContractInspectionAngle,
  ContractPriceType,
  ContractStatus,
  CustomerType,
} from "@prisma/client";
import type { TarsOperationTypeKey } from "src/modules/integrations/tars/tars.constants";

/**
 * NORMALIZED, DIAMOND-OWNED integration DTOs.
 *
 * Every field below is sourced from an existing Diamond model. No TARS payload
 * field name, casing, envelope or transport format is assumed anywhere in this
 * file — a future TarsApiProvider translates these DTOs into the real TARS
 * request shape once official documentation exists.
 */

/** Contract identity. Diamond's contract number is never replaced by TARS. */
export interface TarsContractRef {
  contractId: string;
  contractNumber: string;
  status: ContractStatus;
  termsVersion: string;
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

/** Backend-verified license facts only — never the customer-typed value. */
export interface TarsDrivingLicenseData {
  number: string;
  /** Backend calendar date `YYYY-MM-DD`, not a client timestamp. */
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
}

export interface TarsRentalData {
  priceType: ContractPriceType;
  rentalDays: number;
  /** Whole AED, exactly as agreed on the Diamond Contract. */
  agreedAmount: number;
  currency: string;
  depositAmount: number | null;
  startAt: Date | null;
  endAt: Date | null;
}

/**
 * Inspection evidence passed by REFERENCE. Image bytes stay in the Diamond
 * Attachment store: no Base64, no multipart and no public URL is produced here
 * because TARS upload format is unknown. `streamPath` is the existing
 * staff-authenticated Diamond route, not a shareable link.
 */
export interface TarsAttachmentRef {
  attachmentId: string;
  angle: ContractInspectionAngle;
  mimeType: string;
  streamPath: string;
}

export interface TarsRegisterContractInput {
  contract: TarsContractRef;
  customer: TarsCustomerData;
  vehicle: TarsVehicleData;
  rental: TarsRentalData;
  license: TarsDrivingLicenseData;
}

/**
 * One high-level acceptance capability. Whether TARS exposes send-OTP,
 * verify-OTP, a digital signature call, or a single API is unknown, so this
 * stays a single Diamond boundary and carries NO OTP value.
 */
export interface TarsContractAcceptanceInput {
  contract: TarsContractRef;
  acceptance: {
    acceptedAt: Date;
    termsVersion: string;
    /** Attachment reference only; signature bytes are never copied. */
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
    /** Null until Diamond CLOSE; completion may be prepared while in REVIEW. */
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
  | { operationType: "REGISTER_CONTRACT"; payload: TarsRegisterContractInput }
  | { operationType: "CONTRACT_ACCEPTANCE"; payload: TarsContractAcceptanceInput }
  | { operationType: "HANDOVER"; payload: TarsHandoverInput }
  | { operationType: "RETURN_DOCUMENTATION"; payload: TarsReturnInput }
  | { operationType: "COMPLETE_CONTRACT"; payload: TarsCompleteContractInput };

/**
 * Normalized, Diamond-owned provider result. Provider-specific response
 * structures must never leak past this boundary into the Contracts domain.
 */
export interface TarsProviderResult {
  success: boolean;
  externalContractId?: string;
  externalReference?: string;
  providerOperationId?: string;
  /** Stable Diamond code on failure (e.g. TARS_NOT_CONFIGURED). */
  errorCode?: string;
}

/**
 * Provider capabilities are the five mandatory BUSINESS operations. A future
 * adapter method may call one TARS API or several — that is an adapter detail
 * and must not change this interface.
 */
export interface TarsProvider {
  readonly name: string;
  /** False until a real, credentialed TarsApiProvider exists. */
  readonly configured: boolean;
  registerContract(input: TarsRegisterContractInput): Promise<TarsProviderResult>;
  submitContractAcceptance(
    input: TarsContractAcceptanceInput,
  ): Promise<TarsProviderResult>;
  submitHandover(input: TarsHandoverInput): Promise<TarsProviderResult>;
  submitReturn(input: TarsReturnInput): Promise<TarsProviderResult>;
  completeContract(input: TarsCompleteContractInput): Promise<TarsProviderResult>;
}

/** Outcome of one TarsIntegrationService execution attempt. */
export interface TarsExecutionResult {
  operationId: string;
  operationType: TarsOperationTypeKey;
  status: "SUCCEEDED" | "FAILED";
  attemptNumber: number;
  externalContractId: string | null;
  externalReference: string | null;
  providerOperationId: string | null;
  errorCode: string | null;
}
