import type {
  OfficialContractEdits,
  OfficialContractReviewField,
  OfficialContractReviewPatch,
  OfficialContractView,
} from "../types/official-contract.types";
import {
  invalidReviewFields,
  officialContractReviewPatchSchema,
  reviewFieldValue,
  requiredSignatureSlots,
} from "./official-contract-document.ts";

export type ContractRequirementCode =
  | "IDENTITY"
  | "HIRER_NAME"
  | "NATIONALITY"
  | "PASSPORT_NUMBER"
  | "ADDRESS"
  | "TELEPHONE"
  | "DRIVER_LICENSE_NUMBER"
  | "DRIVER_LICENSE_EXPIRY"
  | "CARD_SETUP"
  | `SIGNATURE_${string}`;

/** Maps backend missing-requirement codes to review PATCH fields (when editable). */
export const REQUIREMENT_TO_REVIEW_FIELD: Partial<
  Record<ContractRequirementCode, OfficialContractReviewField>
> = {
  HIRER_NAME: "hirerName",
  NATIONALITY: "nationality",
  PASSPORT_NUMBER: "passportNumber",
  ADDRESS: "address",
  TELEPHONE: "telephone",
};

export function effectiveReviewValue(
  view: OfficialContractView,
  edits: OfficialContractEdits,
  field: OfficialContractReviewField,
): string {
  const edited = edits[field];
  if (edited !== undefined) return edited.trim();
  return reviewFieldValue(view, field).trim();
}

function effectiveHirer(view: OfficialContractView, edits: OfficialContractEdits) {
  return {
    name: effectiveReviewValue(view, edits, "hirerName") || view.hirer.name?.trim() || "",
    nationality: effectiveReviewValue(view, edits, "nationality") || view.hirer.nationality?.trim() || "",
    passportNumber:
      effectiveReviewValue(view, edits, "passportNumber") || view.hirer.passportNumber?.trim() || "",
    address: effectiveReviewValue(view, edits, "address") || view.hirer.address?.trim() || "",
    telephone: effectiveReviewValue(view, edits, "telephone") || view.hirer.telephone?.trim() || "",
    driverLicenseNumber: view.hirer.driverLicenseNumber?.trim() || "",
    driverLicenseExpiryDate: view.hirer.driverLicenseExpiryDate?.trim() || "",
  };
}

/** Mirrors backend signing gates using local edits before save/sign. */
export function collectContractCompletionIssues(
  view: OfficialContractView,
  edits: OfficialContractEdits,
): { missingRequirements: ContractRequirementCode[]; invalidFields: OfficialContractReviewField[] } {
  const missingRequirements: ContractRequirementCode[] = [];
  if (!view.permissions.canEdit) {
    return { missingRequirements, invalidFields: [] };
  }

  const hirer = effectiveHirer(view, edits);
  if (view.contract.status === "AWAITING" && !view.identity.identityReady) {
    missingRequirements.push("IDENTITY");
  }
  if (!hirer.name) missingRequirements.push("HIRER_NAME");
  if (!hirer.nationality) missingRequirements.push("NATIONALITY");
  if (!hirer.passportNumber) missingRequirements.push("PASSPORT_NUMBER");
  if (!hirer.address) missingRequirements.push("ADDRESS");
  if (!hirer.telephone) missingRequirements.push("TELEPHONE");
  if (!hirer.driverLicenseNumber) missingRequirements.push("DRIVER_LICENSE_NUMBER");
  if (!hirer.driverLicenseExpiryDate) missingRequirements.push("DRIVER_LICENSE_EXPIRY");

  const invalidFields = validateEditablePatch(view, edits);

  return { missingRequirements, invalidFields };
}

export function missingRequirementReviewFields(
  missingRequirements: ContractRequirementCode[],
): OfficialContractReviewField[] {
  const fields: OfficialContractReviewField[] = [];
  for (const code of missingRequirements) {
    const field = REQUIREMENT_TO_REVIEW_FIELD[code];
    if (field) fields.push(field);
  }
  return fields;
}

export function firstScrollTargetField(
  missingRequirements: ContractRequirementCode[],
  invalidFields: OfficialContractReviewField[],
): OfficialContractReviewField | null {
  const fromMissing = missingRequirementReviewFields(missingRequirements);
  return fromMissing[0] ?? invalidFields[0] ?? null;
}

const DEV_TEST_FIELD_VALUES: Partial<Record<OfficialContractReviewField, string>> = {
  address: "Dubai Marina, UAE",
  telephone: "+971501234567",
  nationality: "United Arab Emirates",
  additionalDriverName: "Test Driver",
  additionalDriverNationality: "United Arab Emirates",
  additionalDriverLicenseNumber: "DXB-TEST-001",
  sponsorName: "Test Sponsor",
  sponsorIdNumber: "SP-10001",
};

/** Fills only empty editable fields. Never overrides OCR-locked values. */
export function buildDevTestDataFill(
  view: OfficialContractView,
  edits: OfficialContractEdits,
): OfficialContractEdits {
  const next: OfficialContractEdits = { ...edits };
  for (const field of view.permissions.editableFields) {
    const key = field as OfficialContractReviewField;
    const current = effectiveReviewValue(view, next, key);
    if (current) continue;
    const sample = DEV_TEST_FIELD_VALUES[key];
    if (sample) next[key] = sample;
  }
  return next;
}

export function isDevTestFillEnabled(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

export function validateEditablePatch(
  view: OfficialContractView,
  edits: OfficialContractEdits,
): OfficialContractReviewField[] {
  const patch: OfficialContractReviewPatch = {};
  for (const field of view.permissions.editableFields) {
    const key = field as OfficialContractReviewField;
    const value = effectiveReviewValue(view, edits, key);
    if (value) patch[key] = value;
  }
  const parsed = officialContractReviewPatchSchema.safeParse(patch);
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))] as OfficialContractReviewField[];
}
