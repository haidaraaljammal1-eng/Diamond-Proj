import { createHash } from "node:crypto";
import type { ContractPaymentPurpose } from "@prisma/client";

export interface CheckoutFingerprintInput {
  amount: number;
  currency: string;
  contractId: string;
  purpose: ContractPaymentPurpose;
  targetId: string;
  companyCode: string | null;
  successUrl: string;
  cancelUrl: string;
  savePaymentMethodForFutureUse: boolean;
  consentVersion: string | null;
  stripeCustomerId: string | null;
}

/** Normalized SHA-256 fingerprint of material Stripe Checkout create parameters. */
export function buildCheckoutRequestFingerprint(input: CheckoutFingerprintInput): string {
  const payload = JSON.stringify({
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    contractId: input.contractId,
    purpose: input.purpose,
    targetId: input.targetId,
    companyCode: input.companyCode,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    savePaymentMethodForFutureUse: input.savePaymentMethodForFutureUse,
    consentVersion: input.consentVersion,
    stripeCustomerId: input.stripeCustomerId,
  });
  return createHash("sha256").update(payload).digest("hex");
}
