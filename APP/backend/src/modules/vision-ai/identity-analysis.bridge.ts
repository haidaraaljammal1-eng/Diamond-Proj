import { statusToPolicyConfidence } from "src/modules/vision-ai/extraction/field-normalize";
import type {
  IdentityDocumentAnalysisOutcome,
  IdentityDocumentType,
  NormalizedFieldConfidence,
  NormalizedIdentityDocumentResult,
  SecureDocumentInput,
  VisionStructuredDocumentResult,
} from "src/modules/vision-ai/identity-document.types";
import type { VisionExtractionResult } from "src/modules/vision-ai/vision-ai.types";

function fieldValue(fields: VisionStructuredDocumentResult["fields"], key: string): string | null {
  const entry = fields[key];
  if (!entry || entry.value == null) return null;
  return typeof entry.value === "string" ? entry.value : null;
}

function fieldConfidence(fields: VisionStructuredDocumentResult["fields"], key: string): number | null {
  const entry = fields[key];
  if (!entry) return null;
  return statusToPolicyConfidence(entry.status);
}

export function structuredToNormalized(
  structured: VisionStructuredDocumentResult,
): NormalizedIdentityDocumentResult {
  const fields = structured.fields;
  const recognized = !structured.warnings.includes("DOCUMENT_NOT_RECOGNIZED");
  const confidences: NormalizedFieldConfidence = {};
  const assign = (key: keyof NormalizedFieldConfidence, fieldKey: string) => {
    const value = fieldConfidence(fields, fieldKey);
    if (value != null) confidences[key] = value;
  };
  assign("fullName", "fullName");
  assign("firstName", "firstName");
  assign("lastName", "lastName");
  assign("nationality", "nationality");
  assign("passportNumber", "passportNumber");
  assign("passportExpiryDate", "expiryDate");
  assign("dateOfBirth", "dateOfBirth");
  assign("driverLicenseNumber", "licenceNumber");
  assign("driverLicenseExpiryDate", "expiryDate");
  assign("sex", "sex");
  assign("issuingCountry", "issuingCountry");
  assign("passportIssueDate", "issueDate");
  const numeric = Object.values(confidences).filter((v): v is number => v != null);
  const confidence =
    numeric.length > 0 ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;

  const sexRaw = fieldValue(fields, "sex");
  const sex =
    sexRaw === "M" || sexRaw === "F" || sexRaw === "X" ? sexRaw : null;

  return {
    documentType: structured.documentType,
    documentRecognized: recognized,
    confidence,
    fieldConfidence: confidences,
    fullName: fieldValue(fields, "fullName"),
    firstName: fieldValue(fields, "firstName"),
    middleName: null,
    lastName: fieldValue(fields, "lastName"),
    nationality: fieldValue(fields, "nationality"),
    passportNumber: fieldValue(fields, "passportNumber"),
    passportIssueDate: fieldValue(fields, "issueDate"),
    passportExpiryDate: fieldValue(fields, "expiryDate"),
    dateOfBirth: fieldValue(fields, "dateOfBirth"),
    sex,
    issuingCountry: fieldValue(fields, "issuingCountry"),
    driverLicenseNumber: fieldValue(fields, "licenceNumber"),
    driverLicenseExpiryDate: fieldValue(fields, "expiryDate"),
  };
}

export function mapExtractionFailure(
  provider: string,
  providerVersion: string | null,
  result: Extract<VisionExtractionResult, { ok: false }>,
): IdentityDocumentAnalysisOutcome {
  const reason =
    result.code === "VISION_AI_PROVIDER_UNAVAILABLE"
      ? "IDENTITY_PROVIDER_NOT_CONFIGURED"
      : result.code === "VISION_AI_INVALID_IMAGE"
        ? "IDENTITY_INVALID_IMAGE"
        : result.code === "VISION_AI_SCHEMA_INVALID"
          ? "IDENTITY_ANALYSIS_FAILED"
          : "IDENTITY_ANALYSIS_FAILED";
  return { ok: false, provider, providerVersion, reason };
}

export function mapExtractionSuccess(
  provider: string,
  providerVersion: string | null,
  result: Extract<VisionExtractionResult, { ok: true }>,
): IdentityDocumentAnalysisOutcome {
  const normalized = structuredToNormalized(result.extraction);
  if (!normalized.documentRecognized) {
    return { ok: false, provider, providerVersion, reason: "IDENTITY_NOT_RECOGNIZED" };
  }
  return { ok: true, provider, providerVersion, result: normalized };
}

export function toSecureDocumentInput(file: SecureDocumentInput): SecureDocumentInput {
  return file;
}

export type { IdentityDocumentType };
