import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  CreateCardSetupInput,
  CreateCardSetupResult,
  PaymentProvider,
  PaymentStatusResult,
  WebhookVerifyResult,
} from "src/modules/contracts/payment/payment-provider.types";

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "none";
  readonly configured = false;

  async createCheckoutSession(_input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
  }

  async createCardSetupSession(_input: CreateCardSetupInput): Promise<CreateCardSetupResult> {
    return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
  }

  async getPaymentStatus(_providerReference: string): Promise<PaymentStatusResult> {
    return { status: "UNKNOWN" };
  }

  async verifyWebhook(): Promise<WebhookVerifyResult> {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
}
