export type PublicRentalFlowStep =
  | "LICENSE_VERIFICATION"
  | "CONTRACT"
  | "PAYMENT"
  | "READY_FOR_HANDOVER";

export type DrivingLicenseVerificationStatus =
  | "PENDING"
  | "VALID"
  | "EXPIRED"
  | "UNREADABLE"
  | "REVIEW_REQUIRED"
  | "PROVIDER_UNAVAILABLE";

/** Provider-neutral identity states from the backend. No OCR vendor appears here. */
export type IdentityLicenseStatus =
  | "LICENSE_REQUIRED"
  | "LICENSE_PROCESSING"
  | "LICENSE_VALID"
  | "LICENSE_INVALID";

export type PublicPassportStatus =
  | "REQUIRED"
  | "PROCESSING"
  | "READY"
  | "NOT_RECOGNIZED"
  | "FAILED"
  | "PROVIDER_UNAVAILABLE";

export interface PublicPassportFields {
  fullName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  issuingCountry: string | null;
}

export interface PublicIdentityStatus {
  licenseStatus: IdentityLicenseStatus;
  passport: {
    status: PublicPassportStatus;
    fields: PublicPassportFields | null;
  };
  identityReady: boolean;
}

/** Normalized contract identity draft (future Official Contract Review input). */
export interface PublicIdentityDraft extends PublicPassportFields {
  driverLicenseNumber: string | null;
  driverLicenseExpiryDate: string | null;
  licenseStatus: IdentityLicenseStatus;
  passportStatus:
    | "PASSPORT_REQUIRED"
    | "PASSPORT_PROCESSING"
    | "PASSPORT_READY"
    | "PASSPORT_FAILED";
  identityReady: boolean;
  updatedAt: string | null;
}

/** Local request lifecycle for a document capture (memory only). */
export type DocumentCapturePhase = "idle" | "uploading" | "processing";

export type ContractStatus =
  | "AWAITING"
  | "FORM"
  | "SIGNED"
  | "PAID"
  | "ACTIVE"
  | "RETOUT"
  | "REVIEW"
  | "CLOSED";

export type ContractPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export type ContractPaymentMethod = "BANK_TRANSFER" | "CARD" | "MANUAL";

export interface PublicRentalContext {
  office: { displayName: string };
  flow: { step: PublicRentalFlowStep };
  contract: {
    contractNumber: string;
    status: ContractStatus;
    termsVersion: string;
  };
  vehicle: {
    displayName: string;
    vehicleType: string | null;
    plateNumber: string | null;
    modelYear: number | null;
    color: string | null;
    vin: string | null;
  };
  rental: {
    rentalDays: number;
    agreedAmount: number;
    currency: string;
    startAt: string | null;
    endAt: string | null;
    actualPickupAt: string | null;
    actualReturnAt: string | null;
  };
  customer: {
    name: string;
    mobile: string | null;
    email: string | null;
    nationality: string | null;
    identityNumber: string | null;
    passportNumber: string | null;
    address: string | null;
    drivingLicenseNumber: string | null;
    drivingLicenseExpiry: string | null;
  } | null;
  licenseVerification: {
    status: DrivingLicenseVerificationStatus;
    licenseNumber: string | null;
    licenseNumberMasked: string | null;
    expiryDate: string | null;
    confidence: number | null;
  };
  identity: PublicIdentityStatus;
  payment: {
    status: ContractPaymentStatus | null;
    method: ContractPaymentMethod | null;
    amount: number | null;
    currency: string;
    providerAvailable: boolean;
  };
}

export interface PublicPaymentContext {
  office: { displayName: string };
  contractNumber: string;
  vehicle: { displayName: string; plateNumber: string | null };
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  payment: {
    status: ContractPaymentStatus | null;
    method: ContractPaymentMethod | null;
  };
  providerAvailable: boolean;
}

export interface PublicPaymentAttempt {
  payment: {
    status: ContractPaymentStatus;
    amount: number;
    currency: string;
    method: ContractPaymentMethod;
  };
  checkoutUrl?: string | null;
  statusToken: string | null;
  providerAvailable: boolean;
}

export interface PublicPaymentStatus {
  status: ContractPaymentStatus;
  contractStatus: ContractStatus | null;
  purpose?: string;
  checkoutUrl?: string | null;
}

export interface PublicRentalFormPayload {
  name: string;
  mobile: string;
  email?: string;
  nationality: string;
  identityNumber?: string;
  passportNumber?: string;
  address?: string;
}

export type PublicRentalUiStage =
  | "license"
  | "contract"
  | "payment"
  | "handover";
