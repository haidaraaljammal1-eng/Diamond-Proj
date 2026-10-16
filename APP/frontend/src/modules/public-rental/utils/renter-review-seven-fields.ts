import type { FormField } from "@/shared/components/forms/form-builder";
import type { PublicRentalReviewFormValues } from "../schemas/public-rental-review.schema";

/** Customer-facing review summary — fixed order, exactly seven fields. */
export const RENTER_REVIEW_SEVEN_FIELD_NAMES = [
  "passportNumber",
  "drivingLicenseNumber",
  "drivingLicenseExpiryDate",
  "name",
  "mobile",
  "nationality",
  "address",
] as const satisfies readonly (keyof PublicRentalReviewFormValues)[];

export type RenterReviewSevenFieldName = (typeof RENTER_REVIEW_SEVEN_FIELD_NAMES)[number];

type LabelKey =
  | "fields.passportNumber"
  | "fields.drivingLicenseNumber"
  | "fields.drivingLicenseExpiry"
  | "fields.name"
  | "fields.mobile"
  | "fields.nationality"
  | "fields.address";

const LABEL_KEYS: Record<RenterReviewSevenFieldName, LabelKey> = {
  passportNumber: "fields.passportNumber",
  drivingLicenseNumber: "fields.drivingLicenseNumber",
  drivingLicenseExpiryDate: "fields.drivingLicenseExpiry",
  name: "fields.name",
  mobile: "fields.mobile",
  nationality: "fields.nationality",
  address: "fields.address",
};

export function renterReviewSevenFieldLabel(
  name: RenterReviewSevenFieldName,
  t: (key: string) => string,
): string {
  return t(LABEL_KEYS[name]);
}

export function renterReviewSevenEditFields(
  t: (key: string) => string,
  licenseExpiryReadOnly: boolean,
): FormField<PublicRentalReviewFormValues>[] {
  return RENTER_REVIEW_SEVEN_FIELD_NAMES.map((name) => ({
    type: "text" as const,
    name,
    placeholder: renterReviewSevenFieldLabel(name, t),
    colSpan: 1 as const,
    ...(name === "drivingLicenseExpiryDate" && licenseExpiryReadOnly ? { disabled: true } : {}),
    ...(name === "mobile" ? { autoComplete: "tel" as const } : {}),
    ...(name === "name" ? { autoComplete: "name" as const } : {}),
    ...(name === "address" ? { autoComplete: "street-address" as const } : {}),
    ...(name === "nationality" ? { autoComplete: "country-name" as const } : {}),
  }));
}
