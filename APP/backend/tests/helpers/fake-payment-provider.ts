import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type {
  CreateCardSetupInput,
  CreateCheckoutInput,
  PaymentProvider,
  ProviderPaymentStatus,
  WebhookVerifyResult,
} from "src/modules/contracts/payment/payment-provider.types";

export const TEST_STRIPE_WEBHOOK_SIGNATURE = "whsec_test_signature";

export interface TestWebhookPayload {
  stripeEventId: string;
  eventType: string;
  paymentId: string;
  providerReference: string;
  status: Exclude<ProviderPaymentStatus, "UNKNOWN" | "PENDING" | "PROCESSING">;
  amountMinor?: number;
  currency?: string;
}

export interface TestCardSetupPayload {
  stripeEventId: string;
  eventType: string;
  providerReference: string;
  contractId: string;
  stripeCustomerId?: string;
  stripePaymentMethodId: string;
  cardBrand: string;
  cardLast4: string;
}

export function createFakePaymentProvider(run: string) {
  const statuses = new Map<string, ProviderPaymentStatus>();
  const sessions = new Map<string, CreateCheckoutInput>();
  const paymentRefs = new Map<string, string>();
  const setupSessions = new Map<string, CreateCardSetupInput>();
  const setupRefs = new Map<string, string>();
  let n = 0;
  let eventSeq = 0;

  const provider: PaymentProvider & { lastRef: string | null; lastPaymentId: string | null } = {
    name: "stripe",
    configured: true,
    lastRef: null,
    lastPaymentId: null,
    async createCheckoutSession(input: CreateCheckoutInput) {
      n += 1;
      const ref = `cs_test_${run}_${n}`;
      statuses.set(ref, "PROCESSING");
      sessions.set(ref, input);
      paymentRefs.set(input.paymentId, ref);
      provider.lastRef = ref;
      provider.lastPaymentId = input.paymentId;
      return {
        ok: true,
        provider: "stripe",
        providerReference: ref,
        providerStatus: "open",
        checkoutUrl: `https://checkout.test/${ref}`,
        checkoutExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
    },
    async createCardSetupSession(input: CreateCardSetupInput) {
      n += 1;
      const ref = `setu_test_${run}_${n}`;
      setupSessions.set(ref, input);
      setupRefs.set(input.contractId, ref);
      provider.lastRef = ref;
      provider.lastPaymentId = null;
      return {
        ok: true,
        provider: "stripe",
        providerReference: ref,
        providerStatus: "open",
        checkoutUrl: `https://setup.test/${ref}`,
        checkoutExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
    },
    async getPaymentStatus(ref: string) {
      const input = sessions.get(ref);
      return {
        status: statuses.get(ref) ?? "UNKNOWN",
        amountMinor: input ? input.amount * 100 : undefined,
        currency: input?.currency,
      };
    },
    async verifyWebhook(payload: Buffer, signature: string): Promise<WebhookVerifyResult> {
      if (signature !== TEST_STRIPE_WEBHOOK_SIGNATURE) {
        return { ok: false, reason: "INVALID_SIGNATURE" };
      }
      try {
        const body = JSON.parse(payload.toString()) as TestWebhookPayload | TestCardSetupPayload;
        if (!body.stripeEventId || !body.providerReference) {
          return { ok: false, reason: "INVALID_SIGNATURE" };
        }
        if ("contractId" in body && body.stripePaymentMethodId) {
          return {
            ok: true,
            event: {
              kind: "CARD_SETUP",
              stripeEventId: body.stripeEventId,
              eventType: body.eventType ?? "setup_intent.succeeded",
              providerReference: body.providerReference,
              contractId: body.contractId,
              stripeCustomerId: body.stripeCustomerId,
              stripePaymentMethodId: body.stripePaymentMethodId,
              cardBrand: body.cardBrand,
              cardLast4: body.cardLast4,
            },
          };
        }
        if (!body.paymentId || !body.status) {
          return { ok: false, reason: "INVALID_SIGNATURE" };
        }
        return {
          ok: true,
          event: {
            kind: "PAYMENT",
            stripeEventId: body.stripeEventId,
            eventType: body.eventType ?? "checkout.session.completed",
            paymentId: body.paymentId,
            providerReference: body.providerReference,
            status: body.status,
            amountMinor: body.amountMinor,
            currency: body.currency,
          },
        };
      } catch {
        return { ok: false, reason: "INVALID_SIGNATURE" };
      }
    },
  };

  return {
    provider,
    refForPayment(paymentId: string) {
      return paymentRefs.get(paymentId) ?? null;
    },
    refForCardSetup(contractId: string) {
      return setupRefs.get(contractId) ?? null;
    },
    setupSessionFor(ref: string) {
      return setupSessions.get(ref);
    },
    nextEventId() {
      eventSeq += 1;
      return `evt_test_${run}_${eventSeq}`;
    },
    buildWebhookEvent(input: {
      paymentId: string;
      status?: TestWebhookPayload["status"];
      providerReference?: string;
      stripeEventId?: string;
      amountMinor?: number;
      currency?: string;
    }): TestWebhookPayload {
      const providerReference = input.providerReference ?? paymentRefs.get(input.paymentId);
      if (!providerReference) throw new Error(`No provider reference for payment ${input.paymentId}`);
      const session = sessions.get(providerReference);
      return {
        stripeEventId: input.stripeEventId ?? `evt_test_${run}_${++eventSeq}`,
        eventType: "checkout.session.completed",
        paymentId: input.paymentId,
        providerReference,
        status: input.status ?? "CONFIRMED",
        amountMinor: input.amountMinor ?? (session ? session.amount * 100 : undefined),
        currency: input.currency ?? session?.currency,
      };
    },
    buildCardSetupWebhookEvent(input: {
      contractId: string;
      providerReference?: string;
      stripeEventId?: string;
      stripeCustomerId?: string;
      stripePaymentMethodId: string;
      cardBrand: string;
      cardLast4: string;
    }): TestCardSetupPayload {
      const providerReference = input.providerReference ?? setupRefs.get(input.contractId);
      if (!providerReference) throw new Error(`No setup session for contract ${input.contractId}`);
      return {
        stripeEventId: input.stripeEventId ?? `evt_test_${run}_${++eventSeq}`,
        eventType: "setup_intent.succeeded",
        providerReference,
        contractId: input.contractId,
        stripeCustomerId: input.stripeCustomerId,
        stripePaymentMethodId: input.stripePaymentMethodId,
        cardBrand: input.cardBrand,
        cardLast4: input.cardLast4,
      };
    },
    confirm(ref?: string) {
      const key = ref ?? provider.lastRef;
      if (key) statuses.set(key, "CONFIRMED");
    },
    fail(ref?: string) {
      const key = ref ?? provider.lastRef;
      if (key) statuses.set(key, "FAILED");
    },
    expire(ref?: string) {
      const key = ref ?? provider.lastRef;
      if (key) statuses.set(key, "EXPIRED");
    },
    sessionFor(ref: string) {
      return sessions.get(ref);
    },
  };
}

export async function sendTestStripeWebhook(
  app: FastifyInstance,
  payload: TestWebhookPayload,
  signature = TEST_STRIPE_WEBHOOK_SIGNATURE,
) {
  return app.inject({
    method: "POST",
    url: "/payments/webhooks/stripe",
    headers: {
      "stripe-signature": signature,
      "content-type": "application/json",
    },
    payload: Buffer.from(JSON.stringify(payload)),
  });
}

export async function confirmRentalPaymentViaStatusToken(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  rentalToken: string,
  idempotencyKey?: string,
) {
  const payStart = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/payment`,
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
  });
  assert.equal(payStart.statusCode, 200, payStart.body);
  const statusToken = payStart.json().data.statusToken as string;
  payments.confirm();
  const payStatus = await app.inject({
    method: "GET",
    url: `/contracts/payments/status/${statusToken}`,
  });
  assert.equal(payStatus.statusCode, 200, payStatus.body);
  assert.equal(payStatus.json().data.status, "CONFIRMED");
  return payStatus.json().data;
}

export async function confirmPaymentViaWebhook(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  paymentId: string,
  overrides?: Partial<TestWebhookPayload>,
) {
  const event = payments.buildWebhookEvent({ paymentId, ...overrides });
  const res = await sendTestStripeWebhook(app, event);
  assert.equal(res.statusCode, 200, res.body);
  return event;
}

export async function confirmPaymentViaStatusToken(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  statusToken: string,
) {
  payments.confirm();
  const res = await app.inject({
    method: "GET",
    url: `/contracts/payments/status/${statusToken}`,
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().data;
}
