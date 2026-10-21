import type { PaymentStatusDto } from "../types/payment.types";

export type PaymentCallbackTranslator = (key: string) => string;

export function isPaymentCallbackVerified(status: PaymentStatusDto | null): boolean {
  if (!status || status.status !== "CONFIRMED") return false;
  if (status.purpose === "RENTAL") return status.contractStatus === "PAID";
  return true;
}

export function isRenewalPaymentSuccess(status: PaymentStatusDto | null): boolean {
  return isPaymentCallbackVerified(status) && status?.purpose === "RENEWAL";
}

export function isRentalPaymentSuccess(status: PaymentStatusDto | null): boolean {
  return isPaymentCallbackVerified(status) && status?.purpose === "RENTAL";
}

export function resolveCallbackPageTitleKey(
  status: PaymentStatusDto | null,
  paymentVerified: boolean,
): "title" | "renewalTitle" {
  if (paymentVerified && status?.purpose === "RENEWAL") return "renewalTitle";
  return "title";
}

export function resolveCallbackMessage(
  status: PaymentStatusDto | null,
  failedToken: string | null,
  statusToken: string | null,
  t: PaymentCallbackTranslator,
): string {
  if (!statusToken) return t("failed");
  if (failedToken === statusToken && !status) return t("paymentUnknown");
  if (!status) return t("checking");

  if (status.status === "FAILED") return t("failed");
  if (status.status === "CANCELLED") return t("cancelled");
  if (status.status === "PENDING" || status.status === "PROCESSING") return t("checking");

  if (!isPaymentCallbackVerified(status)) return t("checking");

  if (status.purpose === "RENEWAL") return t("renewalSuccess");

  const authState = status.summary?.rentalPaymentAuthorizationState;
  if (authState === "incomplete") return t("successAuthorizationIncomplete");

  return t("success");
}

export function resolveCallbackAmountLabelKey(
  status: PaymentStatusDto | null,
  paymentVerified: boolean,
): "amountPaid" | "renewalAmountPaid" {
  if (paymentVerified && status?.purpose === "RENEWAL") return "renewalAmountPaid";
  return "amountPaid";
}

export function shouldShowRentalHandoverCopy(status: PaymentStatusDto | null): boolean {
  return status?.purpose === "RENTAL";
}
