import type { ContractDurationUnit, RentalDuration } from "@/modules/contracts/utils/format-rental-duration";
import type { PublicRenewalOffer, PublicRenewalView } from "../types/public-renewal.types";

/** Current rental duration from structured fields; legacy fallback uses rentalDays as days. */
export function publicRenewalCurrentDuration(view: PublicRenewalView): RentalDuration {
  if (view.durationValue != null && view.durationUnit != null) {
    return { durationValue: view.durationValue, durationUnit: view.durationUnit };
  }
  return { durationValue: view.rentalDays, durationUnit: "DAY" };
}

/** Extension duration from stored offer fields; legacy fallback uses additionalDays as days. */
export function publicRenewalExtensionDuration(offer: PublicRenewalOffer): RentalDuration {
  if (offer.additionalDurationValue != null && offer.additionalDurationUnit != null) {
    return {
      durationValue: offer.additionalDurationValue,
      durationUnit: offer.additionalDurationUnit as ContractDurationUnit,
    };
  }
  return { durationValue: offer.additionalDays, durationUnit: "DAY" };
}
