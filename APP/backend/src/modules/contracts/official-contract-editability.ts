import type { OfficialFieldSource } from "src/modules/contracts/official-contract";

/** Review PATCH keys exposed on the public rental contract form. */
export const PUBLIC_CONTRACT_REVIEW_FIELDS = [
  "hirerName",
  "nationality",
  "passportNumber",
  "address",
  "telephone",
  "additionalDriverName",
  "additionalDriverNationality",
  "additionalDriverLicenseNumber",
  "sponsorName",
  "sponsorIdNumber",
] as const;

export type PublicContractReviewField = (typeof PUBLIC_CONTRACT_REVIEW_FIELDS)[number];

const FIELD_PROVENANCE_PATH: Record<PublicContractReviewField, string> = {
  hirerName: "hirer.name",
  nationality: "hirer.nationality",
  passportNumber: "hirer.passportNumber",
  address: "hirer.address",
  telephone: "hirer.telephone",
  additionalDriverName: "additionalDriver.name",
  additionalDriverNationality: "additionalDriver.nationality",
  additionalDriverLicenseNumber: "additionalDriver.driverLicenseNumber",
  sponsorName: "sponsor.name",
  sponsorIdNumber: "sponsor.idNumber",
};

const OCR_LOCK_SOURCES = new Set<OfficialFieldSource>(["PASSPORT_OCR", "DRIVER_LICENSE_OCR"]);

function populated(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * OCR-populated identity fields stay read-only. Empty or non-OCR fields remain
 * editable so the customer can complete the agreement manually.
 */
export function computePublicContractEditableFields(
  provenance: Record<string, OfficialFieldSource>,
  values: Record<string, string | null | undefined>,
): PublicContractReviewField[] {
  const editable: PublicContractReviewField[] = [];
  for (const field of PUBLIC_CONTRACT_REVIEW_FIELDS) {
    const path = FIELD_PROVENANCE_PATH[field];
    const value = values[path] ?? values[field] ?? null;
    const source = provenance[path] ?? "NONE";
    if (populated(value) && OCR_LOCK_SOURCES.has(source)) continue;
    editable.push(field);
  }
  return editable;
}
