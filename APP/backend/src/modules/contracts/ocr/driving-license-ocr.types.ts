/**
 * Driving-license policy input. Produced by `driving-license-ocr.adapter.ts`
 * from the provider-neutral Document OCR result; never by a vendor directly.
 */
export interface DrivingLicenseOcrFieldConfidences {
  licenseNumber?: number;
  expiryDate?: number;
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
}

export interface DrivingLicenseOcrFailure {
  ok: false;
  reason: "NOT_CONFIGURED" | "UNREADABLE";
  provider: string;
  providerVersion?: string;
  confidence?: number | null;
}

export type DrivingLicenseOcrResult = DrivingLicenseOcrSuccess | DrivingLicenseOcrFailure;

export interface DrivingLicenseOcrInput {
  bytes: Buffer;
  mimeType: string;
}
