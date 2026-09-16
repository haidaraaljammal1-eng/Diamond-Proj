import type { ContractPaymentStatus } from "../types/public-renewal.types";

export type RenewalPaymentPanelKind =
  | "unavailable"
  | "ready"
  | "processing"
  | "pending"
  | "failed"
  | "cancelled"
  | "confirmed";

export function renewalPaymentPanelFromStatus(
  providerAvailable: boolean,
  status: ContractPaymentStatus | null | undefined,
): RenewalPaymentPanelKind {
  if (status === "PROCESSING") return "processing";
  if (status === "PENDING") return "pending";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "CONFIRMED") return "confirmed";
  if (!providerAvailable) return "unavailable";
  return "ready";
}

export function canStartRenewalPayment(options: {
  providerAvailable: boolean;
  paymentStatus: ContractPaymentStatus | null | undefined;
  payPending: boolean;
  awaitingPayment: boolean;
}): boolean {
  if (!options.awaitingPayment) return false;
  if (!options.providerAvailable) return false;
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

export function canRetryRenewalPayment(
  status: ContractPaymentStatus | null | undefined,
): boolean {
  return status === "FAILED" || status === "CANCELLED";
}
