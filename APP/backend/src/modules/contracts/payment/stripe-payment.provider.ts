import { env } from "src/config/env";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
} from "src/modules/contracts/payment/payment-provider.types";

/**
 * Future Stripe adapter. No Stripe SDK and no simulated charges.
 * A success URL is never payment proof — webhooks/server status will be.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly configured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
  }

  async getPaymentStatus(_providerReference: string): Promise<PaymentStatusResult> {
    return { status: "UNKNOWN" };
  }

  async verifyWebhook(): Promise<{ ok: false; reason: "NOT_CONFIGURED" }> {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
}
