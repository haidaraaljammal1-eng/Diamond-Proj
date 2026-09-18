import type { ContractPaymentStatus } from "../types/public-rental.types";

export type PaymentPanelKind =
  | "unavailable"
  | "ready"
  | "processing"
  | "pending"
  | "failed"
  | "cancelled"
  | "confirmed";

export function paymentPanelFromStatus(
  providerAvailable: boolean,
  status: ContractPaymentStatus | null | undefined,
): PaymentPanelKind {
  if (status === "PROCESSING") return "processing";
  if (status === "PENDING") return "pending";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "CONFIRMED") return "confirmed";
  if (!providerAvailable) return "unavailable";
  return "ready";
}

export function canStartCardPayment(options: {
  providerAvailable: boolean;
  cardLinked: boolean;
  paymentStatus: ContractPaymentStatus | null | undefined;
  payPending: boolean;
}): boolean {
  if (!options.providerAvailable) return false;
  if (!options.cardLinked) return false;
  if (options.payPending) return false;
  if (
    options.paymentStatus === "PROCESSING" ||
    options.paymentStatus === "PENDING" ||
    options.paymentStatus === "CONFIRMED"
  ) {
    return false;
  }
  return true;
}

export function canRetryPayment(
  status: ContractPaymentStatus | null | undefined,
): boolean {
  return status === "FAILED" || status === "CANCELLED";
}

/**
 * The free Stripe-hosted card-linking action is offered only when the provider
 * is available, a card is not already saved, and no payment is in flight.
 */
export function canStartCardLink(options: {
  providerAvailable: boolean;
  cardLinked: boolean;
  payPending: boolean;
  cardLinkPending: boolean;
  paymentStatus: ContractPaymentStatus | null | undefined;
}): boolean {
  if (options.cardLinked) return false;
  if (!options.providerAvailable) return false;
  if (options.payPending || options.cardLinkPending) return false;
  if (
    options.paymentStatus === "PROCESSING" ||
    options.paymentStatus === "PENDING" ||
    options.paymentStatus === "CONFIRMED"
  ) {
    return false;
  }
  return true;
}

/** Compact mask for the payment summary: `•••• 4817`. Empty when not a 4-digit last4. */
export function maskCardLast4(last4: string | null | undefined): string {
  if (!last4 || !/^\d{4}$/.test(last4)) return "";
  return `•••• ${last4}`;
}
