import { env } from "src/config/env";
import type { PaymentProvider } from "src/modules/contracts/payment/payment-provider.types";
import { StripePaymentProvider } from "src/modules/contracts/payment/stripe-payment.provider";
import { UnconfiguredPaymentProvider } from "src/modules/contracts/payment/unconfigured-payment.provider";

let override: PaymentProvider | undefined;

/** Only the unavailable external payment provider is substituted in development. */
export function devPaymentSimulationEnabled(
  config: { nodeEnv: string; enabled: boolean } = { nodeEnv: env.NODE_ENV, enabled: env.DIAMOND_SIMULATION_ENABLED },
): boolean {
  return config.nodeEnv !== "production" && config.enabled;
}

/** Hosted Checkout collects the payment method at pay time — no pre-link gate. */
export function requiresCardSetupBeforeSigning(
  _config?: { nodeEnv: string; enabled: boolean },
): boolean {
  return false;
}

export function setPaymentProviderForTests(provider: PaymentProvider | undefined): void {
  override = provider;
}

export function createPaymentProvider(): PaymentProvider {
  if (override) return override;
  if (env.PAYMENT_PROVIDER === "stripe") return new StripePaymentProvider();
  return new UnconfiguredPaymentProvider();
}
