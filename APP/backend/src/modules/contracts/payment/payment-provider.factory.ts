import { env } from "src/config/env";
import type { PaymentProvider } from "src/modules/contracts/payment/payment-provider.types";
import { StripePaymentProvider } from "src/modules/contracts/payment/stripe-payment.provider";
import { UnconfiguredPaymentProvider } from "src/modules/contracts/payment/unconfigured-payment.provider";

let override: PaymentProvider | undefined;

export function setPaymentProviderForTests(provider: PaymentProvider | undefined): void {
  override = provider;
}

export function createPaymentProvider(): PaymentProvider {
  if (override) return override;
  if (env.PAYMENT_PROVIDER === "stripe") return new StripePaymentProvider();
  return new UnconfiguredPaymentProvider();
}
