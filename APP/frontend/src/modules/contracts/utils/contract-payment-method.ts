import type { ContractPaymentMethod } from "../types/contract.types";

export const CONTRACT_PAYMENT_METHOD_TRANSLATION_KEY = {
  MANUAL: "payment.method.MANUAL",
  BANK_TRANSFER: "payment.method.BANK_TRANSFER",
  CARD: "payment.method.CARD",
  CASH: "payment.method.CASH",
} as const satisfies Record<ContractPaymentMethod, `payment.method.${ContractPaymentMethod}`>;

export function contractPaymentMethodLabel(
  method: ContractPaymentMethod,
  t: (key: (typeof CONTRACT_PAYMENT_METHOD_TRANSLATION_KEY)[ContractPaymentMethod]) => string,
): string {
  return t(CONTRACT_PAYMENT_METHOD_TRANSLATION_KEY[method]);
}
