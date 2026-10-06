import type { PublicRentalFormPayload } from "../types/public-rental.types";
import type { PublicRentalFormValues } from "../schemas/public-rental-form.schema";
import type { PublicRentalContext } from "../types/public-rental.types";

function optionalTrim(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Customer-editable fields from the form; passport number from passport verification only.
 * Licence number/expiry are applied server-side from DrivingLicenseVerification.
 */
export function toPublicRentalFormPayload(
  values: PublicRentalFormValues,
  context: PublicRentalContext,
): PublicRentalFormPayload {
  const passportNumber =
    context.identity?.passport.fields?.passportNumber?.trim() ||
    context.customer?.passportNumber?.trim() ||
    undefined;

  return {
    name: values.name.trim(),
    mobile: values.mobile.trim(),
    nationality: values.nationality.trim(),
    passportNumber,
    address: optionalTrim(values.address),
  };
}
