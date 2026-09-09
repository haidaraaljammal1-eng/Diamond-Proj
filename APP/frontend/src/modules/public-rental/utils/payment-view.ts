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
  paymentStatus: ContractPaymentStatus | null | undefined;
  payPending: boolean;
}): boolean {
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

export function canRetryPayment(
  status: ContractPaymentStatus | null | undefined,
): boolean {
  return status === "FAILED" || status === "CANCELLED";
}
