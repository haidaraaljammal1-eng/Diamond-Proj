import { env } from "src/config/env";
import { ocrVisibleDateToIso } from "src/modules/document-engine/uae-driving-license-date";
import { extractDrivingLicenseFromImage } from "src/modules/document-engine/uae-driving-license-api.client";
import type {
  UaeDrivingLicenseApiClientErrorCode,
  UaeLicenseApiSuccessBody,
} from "src/modules/document-engine/uae-driving-license-api.types";
import { buildFieldsMetaFromEngineFields } from "src/modules/contracts/driving-license-extraction.mapper";
import type {
  DrivingLicenseEngineExtraction,
  DrivingLicenseOcrInput,
  DrivingLicenseOcrResult,
} from "src/modules/contracts/ocr/driving-license-ocr.types";

const LICENSE_ENGINE_PROVIDER = "uae-driving-license-engine";
const LICENSE_ENGINE_VERSION = "document-engine/license-v1.2-two-field";

type AnalyzeFn = (input: DrivingLicenseOcrInput) => Promise<DrivingLicenseOcrResult>;

let testAnalyze: AnalyzeFn | undefined;

/** Automated-test injection only. Refused in production. */
export function setDrivingLicenseDocumentAnalysisForTests(fn: AnalyzeFn | undefined): void {
  if (env.NODE_ENV === "production" && fn !== undefined) {
    throw new Error("Driving license OCR test hook cannot be injected in production");
  }
  testAnalyze = fn;
}

function fieldText(
  fields: UaeLicenseApiSuccessBody["fields"],
  name: keyof UaeLicenseApiSuccessBody["fields"],
): string | null {
  const row = fields[name];
  if (!row?.value?.trim()) return null;
  return row.value.trim();
}

function fieldConfidence(
  fields: UaeLicenseApiSuccessBody["fields"],
  name: keyof UaeLicenseApiSuccessBody["fields"],
): number | null {
  const row = fields[name];
  if (!row || row.confidence == null) return null;
  return row.confidence;
}

function aggregateConfidence(
  fields: UaeLicenseApiSuccessBody["fields"],
): { confidence: number | null; fieldConfidences: { licenseNumber?: number; expiryDate?: number } } {
  const licenseNumber = fieldConfidence(fields, "license_number");
  const expiryDate = fieldConfidence(fields, "expiry_date");
  const values = [licenseNumber, expiryDate].filter((v): v is number => v != null);
  const confidence = values.length ? Math.min(...values) : null;
  return {
    confidence,
    fieldConfidences: {
      licenseNumber: licenseNumber ?? undefined,
      expiryDate: expiryDate ?? undefined,
    },
  };
}

function buildExtraction(body: UaeLicenseApiSuccessBody): DrivingLicenseEngineExtraction {
  return {
    documentStatus: body.document_status,
    jobId: body.job_id,
    nameEn: null,
    nationality: null,
    dateOfBirth: null,
    issueDate: null,
    placeOfIssue: null,
  };
}

function mapClientError(code: UaeDrivingLicenseApiClientErrorCode): DrivingLicenseOcrResult {
  if (code === "NOT_CONFIGURED") {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      provider: LICENSE_ENGINE_PROVIDER,
      providerVersion: undefined,
    };
  }
  if (
    code === "LICENSE_OCR_UNAVAILABLE" ||
    code === "LICENSE_OCR_TIMEOUT" ||
    code === "LICENSE_OCR_MODEL_UNAVAILABLE"
  ) {
    return {
      ok: false,
      reason: "PROVIDER_UNAVAILABLE",
      provider: LICENSE_ENGINE_PROVIDER,
      providerVersion: undefined,
    };
  }
  if (code === "LICENSE_OCR_CROP_FAILED") {
    return {
      ok: false,
      reason: "BAD_FRAME",
      provider: LICENSE_ENGINE_PROVIDER,
      providerVersion: undefined,
    };
  }
  return {
    ok: false,
    reason: "UNREADABLE",
    provider: LICENSE_ENGINE_PROVIDER,
    providerVersion: undefined,
  };
}

function mapBusinessBody(body: UaeLicenseApiSuccessBody): DrivingLicenseOcrResult {
  const licenseNumber = fieldText(body.fields, "license_number");
  const expiryDate = ocrVisibleDateToIso(fieldText(body.fields, "expiry_date"));
  const holderName = fieldText(body.fields, "name_en");
  const { confidence, fieldConfidences } = aggregateConfidence(body.fields);

  return {
    ok: true,
    licenseNumber,
    expiryDate,
    holderName,
    confidence,
    fieldConfidences,
    provider: LICENSE_ENGINE_PROVIDER,
    providerVersion: "document-engine/license-v1.2-two-field",
    extraction: buildExtraction(body),
    fieldsMeta: buildFieldsMetaFromEngineFields(body.fields),
  };
}

async function analyzeDrivingLicenseDocumentImpl(
  input: DrivingLicenseOcrInput,
): Promise<DrivingLicenseOcrResult> {
  const outcome = await extractDrivingLicenseFromImage({
    bytes: input.bytes,
    mimeType: input.mimeType,
    filename: input.filename,
  });
  if (outcome.kind === "error") {
    return mapClientError(outcome.code);
  }
  return mapBusinessBody(outcome.body);
}

export async function analyzeDrivingLicenseDocument(
  input: DrivingLicenseOcrInput,
): Promise<DrivingLicenseOcrResult> {
  if (testAnalyze && env.NODE_ENV !== "production") {
    return testAnalyze(input);
  }
  return analyzeDrivingLicenseDocumentImpl(input);
}
