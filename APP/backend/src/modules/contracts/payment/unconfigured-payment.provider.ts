import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
} from "src/modules/contracts/payment/payment-provider.types";

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "none";
  readonly configured = false;

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
