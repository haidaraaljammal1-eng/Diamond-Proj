import type { DrivingLicenseExtractionFieldsMeta } from "src/modules/contracts/driving-license-extraction.types";

/**
 * Driving-license policy input. Produced by `driving-license-ocr.adapter.ts`
 * from the Document Engine HTTP result; never by a vendor directly.
 */
export interface DrivingLicenseOcrFieldConfidences {
  licenseNumber?: number;
  expiryDate?: number;
}

export interface DrivingLicenseEngineExtraction {
  documentStatus: "ACCEPT" | "REVIEW_REQUIRED" | "REJECT";
  jobId?: string;
  nameEn?: string | null;
  nationality?: string | null;
  /** ISO `YYYY-MM-DD` when parsed from OCR visible date. */
  dateOfBirth?: string | null;
  issueDate?: string | null;
  placeOfIssue?: string | null;
}

export interface DrivingLicenseOcrSuccess {
  ok: true;
  licenseNumber: string | null;
  /** ISO calendar date `YYYY-MM-DD`, never a zoned timestamp. */
  expiryDate: string | null;
  holderName?: string | null;
  confidence: number | null;
  fieldConfidences?: DrivingLicenseOcrFieldConfidences;
  provider: string;
  providerVersion?: string;
  /** Rich engine fields for persistence and upcoming UI phases. */
  extraction?: DrivingLicenseEngineExtraction;
  /** Per-field engine metadata for `DrivingLicenseExtraction.fieldsMeta`. */
  fieldsMeta?: DrivingLicenseExtractionFieldsMeta;
}

export type DrivingLicenseOcrFailureReason =
  | "NOT_CONFIGURED"
  | "UNREADABLE"
  | "BAD_FRAME"
  | "PROVIDER_UNAVAILABLE";

export interface DrivingLicenseOcrFailure {
  ok: false;
  reason: DrivingLicenseOcrFailureReason;
  provider: string;
  providerVersion?: string;
  confidence?: number | null;
}

export type DrivingLicenseOcrResult = DrivingLicenseOcrSuccess | DrivingLicenseOcrFailure;

export interface DrivingLicenseOcrInput {
  bytes: Buffer;
  mimeType: string;
  filename?: string;
}
