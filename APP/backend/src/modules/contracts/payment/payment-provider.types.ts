import type { ContractPaymentPurpose } from "@prisma/client";

export interface CreateCheckoutInput {
  paymentId: string;
  contractId: string;
  purpose: ContractPaymentPurpose;
  targetId: string;
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCardSetupInput {
  contractId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSuccess {
  ok: true;
  provider: string;
  providerReference: string;
  providerStatus: string;
  checkoutUrl: string;
  checkoutExpiresAt: Date;
}

export interface CreateCheckoutFailure {
  ok: false;
  reason: "NOT_CONFIGURED";
  provider: string;
}

export type CreateCheckoutResult = CreateCheckoutSuccess | CreateCheckoutFailure;

export interface CreateCardSetupSuccess {
  ok: true;
  provider: string;
  providerReference: string;
  providerStatus: string;
  checkoutUrl: string;
  checkoutExpiresAt: Date;
}

export type CreateCardSetupResult = CreateCardSetupSuccess | CreateCheckoutFailure;

export type ProviderPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "UNKNOWN";

export interface PaymentStatusResult {
  status: ProviderPaymentStatus;
  providerStatus?: string;
  amountMinor?: number;
  currency?: string;
}

export interface ParsedWebhookPaymentEvent {
  kind: "PAYMENT";
  stripeEventId: string;
  eventType: string;
  providerReference: string;
  paymentId: string;
  status: Exclude<ProviderPaymentStatus, "UNKNOWN" | "PENDING">;
  amountMinor?: number;
  currency?: string;
}

export interface ParsedWebhookCardSetupEvent {
  kind: "CARD_SETUP";
  stripeEventId: string;
  eventType: string;
  providerReference: string;
  contractId: string;
  stripeCustomerId?: string;
  stripePaymentMethodId: string;
  cardBrand: string;
  cardLast4: string;
}

export interface WebhookVerifySuccess {
  ok: true;
  event: ParsedWebhookPaymentEvent | ParsedWebhookCardSetupEvent;
}

export interface WebhookVerifyFailure {
  ok: false;
  reason: "NOT_CONFIGURED" | "INVALID_SIGNATURE" | "IGNORED";
}

export type WebhookVerifyResult = WebhookVerifySuccess | WebhookVerifyFailure;

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  createCardSetupSession(input: CreateCardSetupInput): Promise<CreateCardSetupResult>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  verifyWebhook(payload: Buffer, signature: string): Promise<WebhookVerifyResult>;
}
