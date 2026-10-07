/** Per-field machine metadata persisted in `DrivingLicenseExtraction.fieldsMeta`. */
export type DrivingLicenseExtractionFieldKey =
  | "license_number"
  | "name_en"
  | "nationality"
  | "date_of_birth"
  | "issue_date"
  | "expiry_date"
  | "place_of_issue";

export interface DrivingLicenseExtractionFieldMeta {
  status: string;
  confidence?: number | null;
  cropStatus?: string | null;
  ocrEligible?: boolean | null;
  engine?: string | null;
}

export type DrivingLicenseExtractionFieldsMeta = Partial<
  Record<DrivingLicenseExtractionFieldKey, DrivingLicenseExtractionFieldMeta>
>;
