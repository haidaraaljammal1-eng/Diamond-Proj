import type { PublicRentalFormPayload } from "../types/public-rental.types";
import type { PublicRentalFormValues } from "../schemas/public-rental-form.schema";

function optionalTrim(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Customer-editable fields only. Never send vehicle, amount, duration, or license. */
export function toPublicRentalFormPayload(
  values: PublicRentalFormValues,
): PublicRentalFormPayload {
  return {
    name: values.name.trim(),
    mobile: values.mobile.trim(),
    nationality: values.nationality.trim(),
    email: optionalTrim(values.email),
    identityNumber: optionalTrim(values.identityNumber),
    passportNumber: optionalTrim(values.passportNumber),
    address: optionalTrim(values.address),
  };
}
