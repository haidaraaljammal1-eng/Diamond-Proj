export type UaeLicenseDocumentStatus = "ACCEPT" | "REVIEW_REQUIRED" | "REJECT";

export type UaeLicenseFieldName =
  | "license_number"
  | "name_en"
  | "nationality"
  | "date_of_birth"
  | "issue_date"
  | "expiry_date"
  | "place_of_issue"
  | "name_ar";

export interface UaeLicenseApiFieldResult {
  value: string | null;
  status: string;
  crop_status?: string | null;
  ocr_eligible?: boolean;
  confidence?: number | null;
  engine?: string | null;
}

export interface UaeLicenseApiSuccessBody {
  job_id: string;
  document_status: UaeLicenseDocumentStatus;
  fields: Partial<Record<UaeLicenseFieldName, UaeLicenseApiFieldResult>>;
  runtime_ms: {
    crop: number;
    ocr: number;
    total: number;
  };
}

export interface UaeLicenseApiHealthBody {
  status: "READY" | "DEGRADED" | "NOT_READY";
  service?: string;
  engine?: string;
}

export type UaeDrivingLicenseApiClientErrorCode =
  | "NOT_CONFIGURED"
  | "LICENSE_OCR_UNAVAILABLE"
  | "LICENSE_OCR_TIMEOUT"
  | "LICENSE_OCR_INVALID_RESPONSE"
  | "LICENSE_OCR_INVALID_IMAGE"
  | "LICENSE_OCR_UNSUPPORTED_FORMAT"
  | "LICENSE_OCR_FILE_TOO_LARGE"
  | "LICENSE_OCR_CROP_FAILED"
  | "LICENSE_OCR_MODEL_UNAVAILABLE"
  | "LICENSE_OCR_INTERNAL_ERROR";

export type UaeDrivingLicenseEngineOutcome =
  | {
      kind: "business";
      body: UaeLicenseApiSuccessBody;
      provider: string;
      providerVersion: string;
    }
  | {
      kind: "error";
      code: UaeDrivingLicenseApiClientErrorCode;
      provider: string;
      providerVersion: string;
    };

export interface UaeDrivingLicenseImageInput {
  bytes: Buffer;
  mimeType: string;
  filename?: string;
}
