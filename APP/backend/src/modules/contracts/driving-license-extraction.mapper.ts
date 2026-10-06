import type { DrivingLicenseExtractionStatus, Prisma } from "@prisma/client";
import {
  calendarDateToStoredUtc,
  parseCalendarDate,
} from "src/modules/contracts/license-calendar";
import type {
  DrivingLicenseExtractionFieldsMeta,
  DrivingLicenseExtractionFieldKey,
} from "src/modules/contracts/driving-license-extraction.types";
import type { DrivingLicenseOcrSuccess } from "src/modules/contracts/ocr/driving-license-ocr.types";

const PROCESSED_FIELD_KEYS: DrivingLicenseExtractionFieldKey[] = [
  "license_number",
  "expiry_date",
];

function isoToStoredUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = parseCalendarDate(iso);
  return parsed ? calendarDateToStoredUtc(parsed) : null;
}

function extractionStatusFromOcr(
  success: DrivingLicenseOcrSuccess,
): DrivingLicenseExtractionStatus {
  const doc = success.extraction?.documentStatus;
  if (doc === "REJECT") return "FAILED";
  if (doc === "ACCEPT") return "READY";
  return "FAILED";
}

export interface DrivingLicenseExtractionCreateInput {
  contractId: string;
  documentId: string;
  attachmentId: string;
  ocr: DrivingLicenseOcrSuccess;
}

export function buildDrivingLicenseExtractionCreateData(
  input: DrivingLicenseExtractionCreateInput,
): Prisma.DrivingLicenseExtractionUncheckedCreateInput {
  const { ocr, contractId, documentId, attachmentId } = input;
  const extraction = ocr.extraction;
  return {
    contractId,
    documentId,
    attachmentId,
    status: extractionStatusFromOcr(ocr),
    engineDocumentStatus: extraction?.documentStatus ?? null,
    jobId: extraction?.jobId ?? null,
    provider: ocr.provider,
    providerVersion: ocr.providerVersion ?? null,
    licenseNumber: ocr.licenseNumber?.trim() || null,
    holderNameEn: null,
    nationality: null,
    dateOfBirth: null,
    issueDate: null,
    expiryDate: isoToStoredUtc(ocr.expiryDate),
    placeOfIssue: null,
    fieldsMeta:
      ocr.fieldsMeta && Object.keys(ocr.fieldsMeta).length > 0
        ? (ocr.fieldsMeta as Prisma.InputJsonValue)
        : undefined,
    completedAt: new Date(),
  };
}

export function buildFieldsMetaFromEngineFields(
  fields: Partial<
    Record<
      DrivingLicenseExtractionFieldKey | "name_ar",
      {
        status: string;
        crop_status?: string | null;
        ocr_eligible?: boolean;
        confidence?: number | null;
        engine?: string | null;
      }
    >
  >,
): DrivingLicenseExtractionFieldsMeta {
  const meta: DrivingLicenseExtractionFieldsMeta = {};
  for (const key of PROCESSED_FIELD_KEYS) {
    const row = fields[key];
    if (!row) continue;
    meta[key] = {
      status: row.status,
      confidence: row.confidence ?? null,
      cropStatus: row.crop_status ?? null,
      ocrEligible: row.ocr_eligible ?? null,
      engine: row.engine ?? null,
    };
  }
  return meta;
}
