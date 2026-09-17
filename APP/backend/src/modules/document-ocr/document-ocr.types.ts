import type {
  DocumentOcrFailureReason,
  DocumentType,
} from "src/modules/document-ocr/document-ocr.constants";

/** Image bytes handed to a provider. Never an application database model. */
export interface SecureDocumentInput {
  bytes: Buffer;
  mimeType: string;
}

export interface DocumentOcrProviderCapabilities {
  supportsDriverLicense: boolean;
  supportsPassport: boolean;
}

/** `YYYY-MM-DD` calendar dates. `sex` is ICAO `M | F | X`. */
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

/** The one Diamond OCR result. Vendor field names never appear here. */
export interface NormalizedIdentityDocumentResult extends NormalizedIdentityDocumentFields {
  documentType: DocumentType;
  documentRecognized: boolean;
  confidence: number | null;
  fieldConfidence: NormalizedFieldConfidence;
}

/**
 * What an adapter returns after mapping its vendor response.
 * Adapters may omit fields; the service fills them with null.
 */
export type DocumentOcrProviderResult =
  | {
      ok: true;
      documentRecognized: boolean;
      fields: Partial<NormalizedIdentityDocumentFields>;
      confidence?: number | null;
      fieldConfidence?: NormalizedFieldConfidence;
      providerVersion?: string;
    }
  | {
      ok: false;
      reason: DocumentOcrFailureReason;
      providerVersion?: string;
    };

export interface DocumentOcrProvider {
  readonly name: string;
  readonly capabilities: DocumentOcrProviderCapabilities;
  analyze(input: {
    documentType: DocumentType;
    file: SecureDocumentInput;
  }): Promise<DocumentOcrProviderResult>;
}

/** Output of `analyzeDocument`: sanitized, normalized, safe to persist. */
export type DocumentOcrOutcome =
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
      reason: DocumentOcrFailureReason;
    };
