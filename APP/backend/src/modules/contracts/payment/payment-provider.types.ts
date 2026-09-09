export interface CreatePaymentInput {
  contractId: string;
  amount: number;
  currency: string;
}

export interface CreatePaymentSuccess {
  ok: true;
  provider: string;
  providerReference: string;
  providerStatus: string;
}

export interface CreatePaymentFailure {
  ok: false;
  reason: "NOT_CONFIGURED";
  provider: string;
}

export type CreatePaymentResult = CreatePaymentSuccess | CreatePaymentFailure;

export type ProviderPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN";

export interface PaymentStatusResult {
  status: ProviderPaymentStatus;
  providerStatus?: string;
}

export interface PaymentWebhookResult {
  ok: boolean;
  reason?: "NOT_CONFIGURED" | "INVALID_SIGNATURE";
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  /** A success URL is never proof. Future Stripe confirmation uses this + getPaymentStatus. */
  verifyWebhook(payload: Buffer, signature: string): Promise<PaymentWebhookResult>;
}

export interface CardPaymentConfirmInput {
  providerReference: string;
}
