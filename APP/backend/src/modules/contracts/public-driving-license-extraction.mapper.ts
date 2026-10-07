import type { DrivingLicenseExtraction } from "@prisma/client";
import { z } from "zod";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";
import type {
  DrivingLicenseExtractionFieldKey,
  DrivingLicenseExtractionFieldsMeta,
} from "src/modules/contracts/driving-license-extraction.types";
import type { PublicDrivingLicenseExtraction } from "src/modules/contracts/contracts.schema";

const EngineDocumentStatusSchema = z.enum(["ACCEPT", "REVIEW_REQUIRED", "REJECT"]);

const FieldMetaEntrySchema = z.object({
  status: z.string(),
  confidence: z.number().nullable().optional(),
  cropStatus: z.string().nullable().optional(),
  ocrEligible: z.boolean().nullable().optional(),
  engine: z.string().nullable().optional(),
});

const FieldsMetaSchema = z
  .object({
    license_number: FieldMetaEntrySchema.optional(),
    name_en: FieldMetaEntrySchema.optional(),
    nationality: FieldMetaEntrySchema.optional(),
    date_of_birth: FieldMetaEntrySchema.optional(),
    issue_date: FieldMetaEntrySchema.optional(),
    expiry_date: FieldMetaEntrySchema.optional(),
    place_of_issue: FieldMetaEntrySchema.optional(),
  })
  .partial();

type PublicFieldKey =
  | "licenseNumber"
  | "holderNameEn"
  | "nationality"
  | "dateOfBirth"
  | "issueDate"
  | "expiryDate"
  | "placeOfIssue";

const META_KEY_BY_PUBLIC: Record<PublicFieldKey, DrivingLicenseExtractionFieldKey> = {
  licenseNumber: "license_number",
  holderNameEn: "name_en",
  nationality: "nationality",
  dateOfBirth: "date_of_birth",
  issueDate: "issue_date",
  expiryDate: "expiry_date",
  placeOfIssue: "place_of_issue",
};

export function parseDrivingLicenseFieldsMeta(raw: unknown): DrivingLicenseExtractionFieldsMeta | null {
  const parsed = FieldsMetaSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data as DrivingLicenseExtractionFieldsMeta;
}

function publicField(
  value: string | null,
  meta: DrivingLicenseExtractionFieldsMeta[DrivingLicenseExtractionFieldKey] | undefined,
): PublicDrivingLicenseExtraction["fields"][PublicFieldKey] {
  const field: PublicDrivingLicenseExtraction["fields"][PublicFieldKey] = { value };
  if (meta?.status) field.ocrStatus = meta.status;
  if (meta?.confidence != null) field.confidence = meta.confidence;
  if (meta?.cropStatus != null) field.cropStatus = meta.cropStatus;
  if (meta?.ocrEligible != null) field.ocrEligible = meta.ocrEligible;
  if (meta?.engine != null) field.engine = meta.engine;
  return field;
}

function formatEngineDocumentStatus(raw: string | null): PublicDrivingLicenseExtraction["engineDocumentStatus"] {
  if (!raw) return null;
  const parsed = EngineDocumentStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Maps a persisted `DrivingLicenseExtraction` row to the public rental API contract.
 */
export function mapDrivingLicenseExtractionForPublicContext(
  row: DrivingLicenseExtraction | null | undefined,
): PublicDrivingLicenseExtraction | null {
  if (!row) return null;

  const fieldsMeta = parseDrivingLicenseFieldsMeta(row.fieldsMeta);

  const stringValue = (v: string | null | undefined) => v?.trim() || null;
  const dateValue = (v: Date | null) => formatStoredExpiry(v);

  const values: Record<PublicFieldKey, string | null> = {
    licenseNumber: stringValue(row.licenseNumber),
    holderNameEn: stringValue(row.holderNameEn),
    nationality: stringValue(row.nationality),
    dateOfBirth: dateValue(row.dateOfBirth),
    issueDate: dateValue(row.issueDate),
    expiryDate: dateValue(row.expiryDate),
    placeOfIssue: stringValue(row.placeOfIssue),
  };

  const fields = {} as PublicDrivingLicenseExtraction["fields"];
  for (const key of Object.keys(META_KEY_BY_PUBLIC) as PublicFieldKey[]) {
    const metaKey = META_KEY_BY_PUBLIC[key];
    fields[key] = publicField(values[key], fieldsMeta?.[metaKey]);
  }

  return {
    status: row.status,
    engineDocumentStatus: formatEngineDocumentStatus(row.engineDocumentStatus),
    fields,
  };
}
