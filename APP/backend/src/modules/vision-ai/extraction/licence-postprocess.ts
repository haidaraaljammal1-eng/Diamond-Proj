import { fieldFromValue } from "src/modules/vision-ai/extraction/field-normalize";
import type { ParsedLicenceVisual } from "src/modules/vision-ai/extraction/licence-date-gemini.schema";
import type { VisionStructuredDocumentResult } from "src/modules/vision-ai/identity-document.types";

function licenceDateField(
  value: string | null,
  needsReview: boolean,
): ReturnType<typeof fieldFromValue> {
  if (needsReview) return fieldFromValue(value, "REVIEW_REQUIRED");
  if (!value) return fieldFromValue(null, "MISSING");
  return fieldFromValue(value, "CANDIDATE");
}

export function buildLicenceStructuredResult(visual: ParsedLicenceVisual): VisionStructuredDocumentResult {
  const warnings: string[] = [];
  const fields = {
    fullName: fieldFromValue(visual.fullName, visual.fullName ? "CANDIDATE" : "MISSING"),
    licenceNumber: fieldFromValue(visual.licenceNumber, visual.licenceNumber ? "CANDIDATE" : "MISSING"),
    nationality: fieldFromValue(visual.nationality, visual.nationality ? "CANDIDATE" : "MISSING"),
    dateOfBirth: licenceDateField(visual.dateOfBirth, visual.dateOfBirthNeedsReview),
    issueDate: licenceDateField(visual.issueDate, visual.issueDateNeedsReview),
    expiryDate: licenceDateField(visual.expiryDate, visual.expiryDateNeedsReview),
    issuingCountry: fieldFromValue(visual.issuingCountry, visual.issuingCountry ? "CANDIDATE" : "MISSING"),
    issuingAuthority: fieldFromValue(visual.issuingAuthority, visual.issuingAuthority ? "CANDIDATE" : "MISSING"),
  };

  const recognized = Boolean(fields.licenceNumber.value || fields.fullName.value);
  if (!recognized) warnings.push("DOCUMENT_NOT_RECOGNIZED");

  const requiresReview = Object.values(fields).some((field) => field.status === "REVIEW_REQUIRED");

  return {
    documentType: "DRIVER_LICENSE",
    fields,
    requiresReview,
    warnings,
  };
}
