import type { ContractPaymentPurpose } from "@prisma/client";

export interface CreateCheckoutInput {
  /** Immutable Stripe Checkout provider attempt id (idempotency scope). */
  checkoutAttemptId: string;
  /** Precomputed Stripe idempotency key for this attempt. */
  idempotencyKey: string;
  paymentId: string;
  contractId: string;
  purpose: ContractPaymentPurpose;
  targetId: string;
  amount: number;
  currency: string;
  /** Safe reconciliation metadata — Contract.company code when available. */
  companyCode?: string | null;
  successUrl: string;
  cancelUrl: string;
  savedPaymentMethod?: {
    stripeCustomerId: string | null;
    stripePaymentMethodId: string;
  } | null;
  /** Stripe Customer for this Checkout session (Diamond Customer mapping). */
  stripeCustomerId?: string | null;
  /** When true, sets payment_intent_data.setup_future_usage = off_session. */
  savePaymentMethodForFutureUse?: boolean;
}

export interface PaymentSessionPaymentMethod {
  stripeCustomerId?: string;
  stripePaymentMethodId: string;
  cardBrand: string;
  cardLast4: string;
}

export interface CreateCardSetupInput {
  contractId: string;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
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

export interface CardSetupSessionResult {
  status: ProviderPaymentStatus;
  providerStatus?: string;
  providerReference: string;
  contractId?: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  cardBrand?: string;
  cardLast4?: string;
}

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

export interface ParsedWebhookIgnoredEvent {
  kind: "IGNORED";
  stripeEventId: string;
  eventType: string;
}

export interface WebhookVerifySuccess {
  ok: true;
  event: ParsedWebhookPaymentEvent | ParsedWebhookCardSetupEvent | ParsedWebhookIgnoredEvent;
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
  getCardSetupSession(providerReference: string): Promise<CardSetupSessionResult>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  getPaymentSessionPaymentMethod(providerReference: string): Promise<PaymentSessionPaymentMethod | null>;
  verifyWebhook(payload: Buffer, signature: string): Promise<WebhookVerifyResult>;
}
