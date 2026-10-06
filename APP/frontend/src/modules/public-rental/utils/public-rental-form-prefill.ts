import type { PublicRentalContext } from "../types/public-rental.types";
import type { PublicRentalFormValues } from "../schemas/public-rental-form.schema";

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Form defaults from saved Customer only (editable fields).
 */
export function resolvePublicRentalFormDefaults(
  context: PublicRentalContext,
): PublicRentalFormValues {
  const customer = context.customer;

  return {
    name: trimOrEmpty(customer?.name),
    mobile: trimOrEmpty(customer?.mobile),
    nationality: trimOrEmpty(customer?.nationality),
    address: trimOrEmpty(customer?.address),
  };
}

export function publicRentalFormMountKey(context: PublicRentalContext): string {
  const contractKey = context.contract.contractNumber;
  if (context.customer?.name?.trim()) {
    return `saved-${contractKey}`;
  }
  return `draft-${contractKey}-manual`;
}

export function shouldShowOcrReviewBanner(): boolean {
  return false;
}
