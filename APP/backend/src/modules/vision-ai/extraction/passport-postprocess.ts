import { fieldFromValue } from "src/modules/vision-ai/extraction/field-normalize";
import type {
  PassportVisualFields,
  VisionExtractedField,
  VisionStructuredDocumentResult,
} from "src/modules/vision-ai/identity-document.types";
import { validateTd3Mrz } from "src/modules/vision-ai/mrz/td3-mrz";

function normalizeCompare(value: string | null): string | null {
  return value?.replace(/\s+/g, "").toUpperCase() ?? null;
}

function reconcileField(
  visual: string | null,
  mrz: string | null,
  mrzTrusted: boolean,
  mrzPresent: boolean,
): VisionExtractedField {
  if (!visual && !mrz) return fieldFromValue(null, "MISSING");
  if (!mrz) return fieldFromValue(visual, visual ? "CANDIDATE" : "MISSING");
  if (!visual) return fieldFromValue(mrz, mrzTrusted ? "CONFIRMED" : "CANDIDATE");
  if (normalizeCompare(visual) === normalizeCompare(mrz)) {
    return fieldFromValue(visual, mrzTrusted ? "CONFIRMED" : "CANDIDATE");
  }
  if (mrzPresent) return fieldFromValue(visual, "REVIEW_REQUIRED");
  return fieldFromValue(visual, "CANDIDATE");
}

export function buildPassportStructuredResult(visual: PassportVisualFields): VisionStructuredDocumentResult {
  const mrz = validateTd3Mrz(visual.mrzLine1, visual.mrzLine2);
  const warnings: string[] = [];
  let requiresReview = false;

  const mrzTrusted = mrz.checksumValid && mrz.parsed != null;
  if (visual.mrzLine1 && visual.mrzLine2 && !mrzTrusted) {
    warnings.push("MRZ_CHECKSUM_INVALID");
    requiresReview = true;
  }

  const mrzPassport = mrz.parsed?.passportNumber ?? null;
  const mrzDob = mrz.isoDateOfBirth;
  const mrzExpiry = mrz.isoExpiryDate;
  const mrzNationality = mrz.parsed?.nationality ?? null;

  const mrzPresent = Boolean(visual.mrzLine1?.trim() && visual.mrzLine2?.trim());
  const passportNumber = reconcileField(visual.passportNumber, mrzPassport, mrzTrusted, mrzPresent);
  const dateOfBirth = reconcileField(visual.dateOfBirth, mrzDob, mrzTrusted, mrzPresent);
  const expiryDate = reconcileField(visual.expiryDate, mrzExpiry, mrzTrusted, mrzPresent);
  const nationality = reconcileField(visual.nationality, mrzNationality, mrzTrusted, mrzPresent);

  const fields: Record<string, VisionExtractedField> = {
    firstName: fieldFromValue(visual.firstName, visual.firstName ? "CANDIDATE" : "MISSING"),
    lastName: fieldFromValue(visual.lastName, visual.lastName ? "CANDIDATE" : "MISSING"),
    fullName: fieldFromValue(visual.fullName, visual.fullName ? "CANDIDATE" : "MISSING"),
    passportNumber,
    nationality,
    dateOfBirth,
    expiryDate,
    sex: fieldFromValue(visual.sex, visual.sex ? "CANDIDATE" : "MISSING"),
    issuingCountry: fieldFromValue(visual.issuingCountry, visual.issuingCountry ? "CANDIDATE" : "MISSING"),
    mrzLine1: fieldFromValue(visual.mrzLine1, visual.mrzLine1 ? "CANDIDATE" : "MISSING"),
    mrzLine2: fieldFromValue(visual.mrzLine2, visual.mrzLine2 ? "CANDIDATE" : "MISSING"),
  };

  for (const field of Object.values(fields)) {
    if (field.status === "REVIEW_REQUIRED") requiresReview = true;
  }

  const recognized = Boolean(
    fields.passportNumber?.value ||
      fields.fullName?.value ||
      fields.firstName?.value ||
      fields.lastName?.value,
  );
  if (!recognized) {
    warnings.push("DOCUMENT_NOT_RECOGNIZED");
  }

  return {
    documentType: "PASSPORT",
    fields,
    requiresReview,
    warnings,
  };
}
