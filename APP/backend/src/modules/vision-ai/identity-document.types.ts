/** Image bytes handed to Vision AI. Never an application database model. */
export interface SecureDocumentInput {
  bytes: Buffer;
  mimeType: string;
}

export const IDENTITY_DOCUMENT_TYPES = ["PASSPORT", "DRIVER_LICENSE"] as const;
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];

export const VISION_FIELD_STATUSES = [
  "CONFIRMED",
  "CANDIDATE",
  "MISSING",
  "REVIEW_REQUIRED",
] as const;
export type VisionFieldStatus = (typeof VISION_FIELD_STATUSES)[number];

export interface VisionExtractedField<T = string | null> {
  value: T;
  status: VisionFieldStatus;
}

export interface VisionStructuredDocumentResult {
  documentType: IdentityDocumentType;
  fields: Record<string, VisionExtractedField>;
  requiresReview: boolean;
  warnings: string[];
}

export interface PassportVisualFields {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  expiryDate: string | null;
  sex: "M" | "F" | "X" | null;
  issuingCountry: string | null;
  mrzLine1: string | null;
  mrzLine2: string | null;
}

export interface DrivingLicenceVisualFields {
  fullName: string | null;
  licenceNumber: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingCountry: string | null;
  issuingAuthority: string | null;
}

/** Legacy normalized shape consumed by contract passport/license policies. */
export interface NormalizedIdentityDocumentFields {
  fullName: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nationality: string | null;
  passportNumber: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  dateOfBirth: string | null;
  sex: "M" | "F" | "X" | null;
  issuingCountry: string | null;
  driverLicenseNumber: string | null;
  driverLicenseExpiryDate: string | null;
}

export type NormalizedIdentityField = keyof NormalizedIdentityDocumentFields;

export type NormalizedFieldConfidence = Partial<Record<NormalizedIdentityField, number>>;

export interface NormalizedIdentityDocumentResult extends NormalizedIdentityDocumentFields {
  documentType: IdentityDocumentType;
  documentRecognized: boolean;
  confidence: number | null;
  fieldConfidence: NormalizedFieldConfidence;
}

export const IDENTITY_ANALYSIS_FAILURE_REASONS = [
  "IDENTITY_PROVIDER_NOT_CONFIGURED",
  "IDENTITY_NOT_RECOGNIZED",
  "IDENTITY_ANALYSIS_FAILED",
  "IDENTITY_INVALID_IMAGE",
] as const;
export type IdentityAnalysisFailureReason = (typeof IDENTITY_ANALYSIS_FAILURE_REASONS)[number];

export type IdentityDocumentAnalysisOutcome =
  | {
      ok: true;
      provider: string;
      providerVersion: string | null;
      result: NormalizedIdentityDocumentResult;
    }
  | {
      ok: false;
      provider: string;
      providerVersion: string | null;
      reason: IdentityAnalysisFailureReason;
    };
