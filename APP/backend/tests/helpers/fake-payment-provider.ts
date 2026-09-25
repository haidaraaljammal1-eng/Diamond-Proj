import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { hashToken } from "src/lib/security/tokens";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import { createStripeWebhookWorker } from "src/modules/contracts/payment/stripe-webhook-worker.service";
import type {
  CardSetupSessionResult,
  CreateCardSetupInput,
  CreateCheckoutInput,
  CreateCheckoutSuccess,
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
  const idempotencyResults = new Map<string, CreateCheckoutSuccess>();
  const paymentRefs = new Map<string, string>();
  const setupSessions = new Map<string, CreateCardSetupInput>();
  const setupRefs = new Map<string, string>();
  const setupResults = new Map<string, CardSetupSessionResult>();
  let n = 0;
  let eventSeq = 0;
  let getPaymentStatusCalls = 0;
  let expireBlocked = false;
  let offSessionCallCount = 0;
  let checkoutCallCount = 0;
  type OffSessionBehavior =
    | { mode: "confirm" }
    | { mode: "processing" }
    | { mode: "failed"; failureCode?: string };
  let offSessionBehavior: OffSessionBehavior = { mode: "confirm" };

  const provider: PaymentProvider & {
    lastRef: string | null;
    lastPaymentId: string | null;
    getPaymentStatusCallCount: () => number;
    resetPaymentStatusCallCount: () => void;
    getOffSessionCallCount: () => number;
    resetOffSessionCallCount: () => void;
    setOffSessionBehavior: (behavior: OffSessionBehavior) => void;
    resetOffSessionBehavior: () => void;
  } = {
    name: "stripe",
    configured: true,
    lastRef: null,
    lastPaymentId: null,
    async createCheckoutSession(input: CreateCheckoutInput) {
      const cached = idempotencyResults.get(input.idempotencyKey);
      if (cached) return cached;
      checkoutCallCount += 1;
      n += 1;
      const ref = `cs_test_${run}_${input.checkoutAttemptId.replace(/-/g, "").slice(0, 16)}`;
      statuses.set(ref, "PROCESSING");
      sessions.set(ref, input);
      paymentRefs.set(input.paymentId, ref);
      provider.lastRef = ref;
      provider.lastPaymentId = input.paymentId;
      const result: CreateCheckoutSuccess = {
        ok: true,
        provider: "stripe",
        providerReference: ref,
        providerStatus: "open",
        checkoutUrl: `https://checkout.stripe.com/c/pay/${ref}`,
        checkoutExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
      idempotencyResults.set(input.idempotencyKey, result);
      return result;
    },
    async createCardSetupSession(input: CreateCardSetupInput) {
      n += 1;
      const ref = `setu_test_${run}_${n}`;
      setupSessions.set(ref, input);
      setupRefs.set(input.contractId, ref);
      setupResults.set(ref, {
        status: "PROCESSING",
        providerReference: ref,
        providerStatus: "open",
        contractId: input.contractId,
      });
      provider.lastRef = ref;
      provider.lastPaymentId = null;
      return {
        ok: true,
        provider: "stripe",
        providerReference: ref,
        providerStatus: "open",
        checkoutUrl: `https://checkout.stripe.com/c/pay/${ref}`,
        checkoutExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
    },
    async getCardSetupSession(ref: string) {
      return setupResults.get(ref) ?? { status: "UNKNOWN", providerReference: ref };
    },
    getPaymentStatusCallCount: () => getPaymentStatusCalls,
    resetPaymentStatusCallCount: () => {
      getPaymentStatusCalls = 0;
    },
    getOffSessionCallCount: () => offSessionCallCount,
    resetOffSessionCallCount: () => {
      offSessionCallCount = 0;
    },
    setOffSessionBehavior: (behavior: OffSessionBehavior) => {
      offSessionBehavior = behavior;
    },
    resetOffSessionBehavior: () => {
      offSessionBehavior = { mode: "confirm" };
    },
    async getPaymentStatus(ref: string) {
      getPaymentStatusCalls += 1;
      const input = sessions.get(ref);
      return {
        status: statuses.get(ref) ?? "UNKNOWN",
        providerStatus: statuses.get(ref),
        amountMinor: input ? input.amount * 100 : undefined,
        currency: input?.currency,
      };
    },
    async expireCheckoutSession(ref: string) {
      const status = statuses.get(ref) ?? "UNKNOWN";
      if (status === "CONFIRMED") {
        const input = sessions.get(ref);
        return {
          status: "CONFIRMED" as const,
          amountMinor: input ? input.amount * 100 : undefined,
          currency: input?.currency,
        };
      }
      if (status === "EXPIRED" || status === "CANCELLED" || status === "FAILED") {
        return { status: "EXPIRED" as const };
      }
      if (expireBlocked || status === "UNKNOWN") return { status: "NOT_EXPIRABLE" as const };
      statuses.set(ref, "EXPIRED");
      return { status: "EXPIRED" as const };
    },
    async getPaymentIntentStatus(ref: string) {
      return { status: statuses.get(ref) ?? "UNKNOWN", providerReference: ref };
    },
    async createOffSessionPaymentIntent(input: import("src/modules/contracts/payment/payment-provider.types").CreateOffSessionPaymentInput) {
      offSessionCallCount += 1;
      const ref = `pi_test_${run}_${input.paymentId.slice(0, 8)}`;
      if (offSessionBehavior.mode === "processing") {
        statuses.set(ref, "PROCESSING");
        paymentRefs.set(input.paymentId, ref);
        provider.lastRef = ref;
        provider.lastPaymentId = input.paymentId;
        return {
          providerReference: ref,
          providerStatus: "processing",
          status: "PROCESSING" as const,
          requiresAction: false,
          amountMinor: input.amount * 100,
          currency: input.currency,
        };
      }
      if (offSessionBehavior.mode === "failed") {
        statuses.set(ref, "FAILED");
        paymentRefs.set(input.paymentId, ref);
        provider.lastRef = ref;
        provider.lastPaymentId = input.paymentId;
        return {
          providerReference: ref,
          providerStatus: "failed",
          status: "FAILED" as const,
          requiresAction: false,
          failureCode: offSessionBehavior.failureCode ?? "card_declined",
          amountMinor: input.amount * 100,
          currency: input.currency,
        };
      }
      statuses.set(ref, "CONFIRMED");
      paymentRefs.set(input.paymentId, ref);
      provider.lastRef = ref;
      provider.lastPaymentId = input.paymentId;
      return {
        providerReference: ref,
        providerStatus: "succeeded",
        status: "CONFIRMED" as const,
        requiresAction: false,
        amountMinor: input.amount * 100,
        currency: input.currency,
      };
    },
    async getPaymentSessionPaymentMethod(ref: string) {
      const input = sessions.get(ref);
      if (!input?.savePaymentMethodForFutureUse) return null;
      return {
        stripeCustomerId: input.stripeCustomerId ?? "cus_test_fake",
        stripePaymentMethodId: "pm_test_fake",
        cardBrand: "visa",
        cardLast4: "4242",
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
        if ("contractId" in body) {
          if (!body.stripePaymentMethodId) return { ok: false, reason: "INVALID_SIGNATURE" };
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
      setupResults.set(providerReference, {
        status: "CONFIRMED",
        providerStatus: "succeeded",
        providerReference,
        contractId: input.contractId,
        stripeCustomerId: input.stripeCustomerId,
        stripePaymentMethodId: input.stripePaymentMethodId,
        cardBrand: input.cardBrand,
        cardLast4: input.cardLast4,
      });
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
    blockCheckoutExpire(blocked = true) {
      expireBlocked = blocked;
    },
    sessionFor(ref: string) {
      return sessions.get(ref);
    },
    getOffSessionCallCount: () => offSessionCallCount,
    resetOffSessionCallCount: () => {
      offSessionCallCount = 0;
    },
    getCheckoutCallCount: () => checkoutCallCount,
    resetCheckoutCallCount: () => {
      checkoutCallCount = 0;
    },
    setOffSessionBehavior: (behavior: OffSessionBehavior) => {
      offSessionBehavior = behavior;
    },
    resetOffSessionBehavior: () => {
      offSessionBehavior = { mode: "confirm" };
    },
  };
}

export async function sendTestStripeWebhook(
  app: FastifyInstance,
  payload: TestWebhookPayload | TestCardSetupPayload,
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

/** Processes durable Stripe webhook inbox rows (async worker path). */
export async function flushStripeWebhookInbox(app: FastifyInstance): Promise<void> {
  await createStripeWebhookWorker(app).runStripeWebhookCycle();
}

export async function reconcileFakeProviderPayment(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  paymentId: string,
): Promise<void> {
  payments.confirm();
  const service = createContractPaymentService(app.prisma);
  await service.reconcilePaymentWithProvider(paymentId);
}

/** Exceptional provider reconciliation after the fake provider reports failure. */
export async function reconcileFailedFakeProviderPayment(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  paymentId: string,
): Promise<void> {
  payments.fail(payments.refForPayment(paymentId) ?? undefined);
  const service = createContractPaymentService(app.prisma);
  await service.reconcilePaymentWithProvider(paymentId);
}

/**
 * Links a card through the real public card-link flow (setup session, then the
 * browser return validated server-side), backed by the fake provider. Rental
 * payment requires a linked card, so helpers that pay must call this first.
 */
export async function linkCardViaFakeProvider(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  rentalToken: string,
  contractId: string,
) {
  const started = await app.inject({ method: "POST", url: `/contracts/rental/${rentalToken}/card-link` });
  assert.equal(started.statusCode, 200, started.body);
  const event = payments.buildCardSetupWebhookEvent({
    contractId,
    stripeCustomerId: `cus_test_${contractId}`,
    stripePaymentMethodId: `pm_test_${contractId}`,
    cardBrand: "visa",
    cardLast4: "4242",
  });
  const returned = await app.inject({
    method: "GET",
    url: `/contracts/rental/${rentalToken}/card-link/return?setupSessionId=${event.providerReference}`,
  });
  assert.equal(returned.statusCode, 200, returned.body);
  assert.equal(returned.json().data.status, "CONFIRMED");
}

export async function confirmRentalPaymentViaStatusToken(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  rentalToken: string,
  idempotencyKey = `test-pay-${rentalToken.slice(0, 12)}`,
) {
  const payStart = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/payment`,
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    payload: { savePaymentMethodForFutureUse: false },
  });
  assert.equal(payStart.statusCode, 200, payStart.body);
  const statusToken = payStart.json().data.statusToken as string;
  assert.ok(statusToken, payStart.body);
  const payment = await app.prisma.contractPayment.findUnique({
    where: { statusTokenHash: hashToken(statusToken) },
  });
  assert.ok(payment, "payment for status token");
  payments.confirm();
  await reconcileFakeProviderPayment(app, payments, payment.id);
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
  await flushStripeWebhookInbox(app);
  return event;
}

export async function confirmPaymentViaStatusToken(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  statusToken: string,
) {
  const payment = await app.prisma.contractPayment.findUnique({
    where: { statusTokenHash: hashToken(statusToken) },
  });
  assert.ok(payment, "payment for status token");
  await reconcileFakeProviderPayment(app, payments, payment.id);
  const res = await app.inject({
    method: "GET",
    url: `/contracts/payments/status/${statusToken}`,
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().data;
}
