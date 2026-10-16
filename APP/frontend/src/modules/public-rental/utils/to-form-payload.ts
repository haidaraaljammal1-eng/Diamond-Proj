import type { PublicRentalFormPayload } from "../types/public-rental.types";
import type { PublicRentalReviewFormValues } from "../schemas/public-rental-review.schema";

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Final reviewed values for POST /form (canonical identity boundary). */
export function toPublicRentalFormPayload(values: PublicRentalReviewFormValues): PublicRentalFormPayload {
  return {
    name: values.name.trim(),
    mobile: values.mobile.trim(),
    nationality: values.nationality.trim(),
    passportNumber: values.passportNumber.trim(),
    address: optionalTrim(values.address),
    licenseDocumentId: values.licenseDocumentId,
    passportDocumentId: values.passportDocumentId,
    drivingLicenseNumber: values.drivingLicenseNumber.trim(),
    drivingLicenseExpiryDate: values.drivingLicenseExpiryDate.trim(),
  };
}
