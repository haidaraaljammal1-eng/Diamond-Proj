import Stripe from "stripe";
import { env } from "src/config/env";
import { aedToStripeMinorUnits, assertAedCurrency } from "src/modules/contracts/payment/money";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  CreateCardSetupInput,
  CreateCardSetupResult,
  ExpireCheckoutSessionResult,
  PaymentProvider,
  PaymentStatusResult,
  ProviderPaymentStatus,
  WebhookVerifyResult,
} from "src/modules/contracts/payment/payment-provider.types";
import { recordProviderStatusLookup } from "src/modules/contracts/payment/payment-provider-instrumentation";

export function mapExpiredCheckoutSession(session: Stripe.Checkout.Session): ExpireCheckoutSessionResult {
  const status = mapSessionStatus(session);
  if (status === "CONFIRMED") {
    return {
      status: "CONFIRMED",
      providerStatus: session.status ?? undefined,
      amountMinor: session.amount_total ?? undefined,
      currency: session.currency?.toUpperCase(),
    };
  }
  if (status === "EXPIRED" || status === "CANCELLED" || status === "FAILED") {
    return { status: "EXPIRED" };
  }
  return { status: "NOT_EXPIRABLE" };
}

export function mapSessionStatus(session: Stripe.Checkout.Session): ProviderPaymentStatus {
  switch (session.status) {
    case "complete":
      return session.payment_status === "paid" ? "CONFIRMED" : "PROCESSING";
    case "expired":
      return "EXPIRED";
    case "open":
      return "PROCESSING";
    default:
      return "UNKNOWN";
  }
}

export function mapPaymentIntentStatus(
  status: Stripe.PaymentIntent.Status | null,
  options?: { lastPaymentError?: Stripe.PaymentIntent.LastPaymentError | null },
): ProviderPaymentStatus {
  if (options?.lastPaymentError) return "FAILED";
  switch (status) {
    case "succeeded":
      return "CONFIRMED";
    case "processing":
      return "PROCESSING";
    case "canceled":
      return "CANCELLED";
    case "requires_payment_method":
    case "requires_confirmation":
      return "PROCESSING";
    case "requires_action":
      return "PROCESSING";
    default:
      return "UNKNOWN";
  }
}

/** Maps an open Checkout session + expanded PaymentIntent to a durable provider status. */
export function resolveCheckoutPaymentStatus(
  session: Pick<Stripe.Checkout.Session, "status" | "payment_status">,
  paymentIntent: Pick<Stripe.PaymentIntent, "status" | "last_payment_error"> | null,
): ProviderPaymentStatus {
  if (session.status === "expired") return "EXPIRED";
  if (session.status === "complete") {
    return session.payment_status === "paid" ? "CONFIRMED" : "PROCESSING";
  }
  if (paymentIntent) {
    return mapPaymentIntentStatus(paymentIntent.status, {
      lastPaymentError: paymentIntent.last_payment_error,
    });
  }
  return mapSessionStatus(session as Stripe.Checkout.Session);
}

/**
 * Production Stripe adapter. When credentials are missing, configured=false and
 * every call fails closed — no fake URLs or confirmed payments.
 */
/** Pure Checkout Session params for rental payment (testable without Stripe network). */
export function buildStripePaymentCheckoutParams(
  input: CreateCheckoutInput,
  unitAmount: number,
): Stripe.Checkout.SessionCreateParams {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    payment_method_types: ["card"],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.paymentId,
    metadata: {
      paymentId: input.paymentId,
      purpose: input.purpose,
      contractId: input.contractId,
      targetId: input.targetId,
      savePaymentMethodForFutureUse: input.savePaymentMethodForFutureUse ? "true" : "false",
      ...(input.companyCode ? { companyCode: input.companyCode } : {}),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: `Diamond ${input.purpose}`,
          },
        },
      },
    ],
  };
  const customerId =
    input.stripeCustomerId ?? input.savedPaymentMethod?.stripeCustomerId ?? null;
  if (customerId) {
    params.customer = customerId;
  }
  params.payment_intent_data = {
    metadata: {
      paymentId: input.paymentId,
      contractId: input.contractId,
      purpose: input.purpose,
      targetId: input.targetId,
      ...(input.companyCode ? { companyCode: input.companyCode } : {}),
    },
    ...(input.savePaymentMethodForFutureUse ? { setup_future_usage: "off_session" as const } : {}),
  };
  return params;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  /** Checkout and status polling need the API secret; webhooks need `STRIPE_WEBHOOK_SECRET` too. */
  readonly configured = Boolean(env.STRIPE_SECRET_KEY);

  private client(): Stripe {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe secret key is not configured");
    }
    return new Stripe(env.STRIPE_SECRET_KEY);
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (!this.configured) {
      return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
    }
    assertAedCurrency(input.currency);
    const unitAmount = aedToStripeMinorUnits(input.amount);
    const params = buildStripePaymentCheckoutParams(input, unitAmount);
    const session = await this.client().checkout.sessions.create(params, {
      idempotencyKey: input.idempotencyKey,
    });
    if (!session.url || !session.id) {
      return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
    }
    const expiresAt =
      session.expires_at != null
        ? new Date(session.expires_at * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      ok: true,
      provider: this.name,
      providerReference: session.id,
      providerStatus: session.status ?? "open",
      checkoutUrl: session.url,
      checkoutExpiresAt: expiresAt,
    };
  }

  async createCardSetupSession(input: CreateCardSetupInput): Promise<CreateCardSetupResult> {
    if (!this.configured) return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
    const stripe = this.client();
    const customerId =
      input.stripeCustomerId ??
      (
        await stripe.customers.create({
          metadata: { contractId: input.contractId, purpose: "CARD_SETUP" },
        })
      ).id;
    const session = await this.client().checkout.sessions.create({
      mode: "setup",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { kind: "CARD_SETUP", contractId: input.contractId },
      client_reference_id: input.contractId,
      customer: customerId,
      payment_method_types: ["card"],
    });
    if (!session.url || !session.id) return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
    return {
      ok: true,
      provider: this.name,
      providerReference: session.id,
      providerStatus: session.status ?? "open",
      checkoutUrl: session.url,
      checkoutExpiresAt: session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + 86400000),
    };
  }

  async getCardSetupSession(providerReference: string) {
    if (!this.configured) return { status: "UNKNOWN" as const, providerReference };
    const session = await this.client().checkout.sessions.retrieve(providerReference, {
      expand: ["setup_intent.payment_method"],
    });
    const setupIntent =
      typeof session.setup_intent === "object" && session.setup_intent
        ? session.setup_intent
        : null;
    const paymentMethod =
      setupIntent && typeof setupIntent.payment_method === "object"
        ? setupIntent.payment_method
        : null;
    const card = paymentMethod?.type === "card" ? paymentMethod.card : null;
    if (session.status !== "complete" || setupIntent?.status !== "succeeded" || !paymentMethod || !card) {
      return {
        status: mapSessionStatus(session),
        providerStatus: setupIntent?.status ?? session.status ?? undefined,
        providerReference,
        contractId: session.metadata?.contractId,
      };
    }
    return {
      status: "CONFIRMED" as const,
      providerStatus: setupIntent.status,
      providerReference,
      contractId: session.metadata?.contractId,
      stripeCustomerId:
        typeof setupIntent.customer === "string"
          ? setupIntent.customer
          : typeof session.customer === "string"
            ? session.customer
            : undefined,
      stripePaymentMethodId: paymentMethod.id,
      cardBrand: card.brand,
      cardLast4: card.last4,
    };
  }

  async getPaymentSessionPaymentMethod(providerReference: string) {
    if (!this.configured) return null;
    const session = await this.client().checkout.sessions.retrieve(providerReference, {
      expand: ["payment_intent.payment_method"],
    });
    if (session.payment_status !== "paid") return null;
    const paymentIntent =
      typeof session.payment_intent === "object" && session.payment_intent
        ? session.payment_intent
        : null;
    const paymentMethod =
      paymentIntent && typeof paymentIntent.payment_method === "object"
        ? paymentIntent.payment_method
        : null;
    const card = paymentMethod?.type === "card" ? paymentMethod.card : null;
    if (!paymentMethod || !card || paymentMethod.type !== "card") return null;
    const stripeCustomerId =
      typeof paymentIntent?.customer === "string"
        ? paymentIntent.customer
        : typeof session.customer === "string"
          ? session.customer
          : undefined;
    return {
      stripeCustomerId,
      stripePaymentMethodId: paymentMethod.id,
      cardBrand: card.brand,
      cardLast4: card.last4,
    };
  }

  async getPaymentIntentStatus(providerReference: string) {
    if (!this.configured) return { status: "UNKNOWN" as const };
    recordProviderStatusLookup();
    const paymentIntent = await this.client().paymentIntents.retrieve(providerReference);
    const status = mapPaymentIntentStatus(paymentIntent.status, {
      lastPaymentError: paymentIntent.last_payment_error,
    });
    const requiresAction = paymentIntent.status === "requires_action";
    return {
      status,
      providerStatus: paymentIntent.status,
      amountMinor: paymentIntent.amount ?? undefined,
      currency: paymentIntent.currency?.toUpperCase(),
      failureCode: paymentIntent.last_payment_error?.code ?? null,
      declineCode: paymentIntent.last_payment_error?.decline_code ?? null,
      requiresAction,
    };
  }

  async createOffSessionPaymentIntent(
    input: import("src/modules/contracts/payment/payment-provider.types").CreateOffSessionPaymentInput,
  ) {
    if (!this.configured) {
      return {
        providerReference: "",
        providerStatus: "failed",
        status: "FAILED" as const,
        requiresAction: false,
      };
    }
    assertAedCurrency(input.currency);
    const unitAmount = aedToStripeMinorUnits(input.amount);
    const paymentIntent = await this.client().paymentIntents.create(
      {
        amount: unitAmount,
        currency: input.currency.toLowerCase(),
        customer: input.stripeCustomerId,
        payment_method: input.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          paymentId: input.paymentId,
          contractId: input.contractId,
          purpose: input.purpose,
          targetId: input.targetId,
          ...(input.companyCode ? { companyCode: input.companyCode } : {}),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    const status = mapPaymentIntentStatus(paymentIntent.status, {
      lastPaymentError: paymentIntent.last_payment_error,
    });
    return {
      providerReference: paymentIntent.id,
      providerStatus: paymentIntent.status,
      status,
      failureCode: paymentIntent.last_payment_error?.code ?? null,
      declineCode: paymentIntent.last_payment_error?.decline_code ?? null,
      requiresAction: paymentIntent.status === "requires_action",
      amountMinor: paymentIntent.amount ?? undefined,
      currency: paymentIntent.currency?.toUpperCase(),
    };
  }

  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    if (!this.configured) return { status: "UNKNOWN" };
    recordProviderStatusLookup();
    const session = await this.client().checkout.sessions.retrieve(providerReference, {
      expand: ["payment_intent"],
    });
    const paymentIntent =
      typeof session.payment_intent === "object" && session.payment_intent
        ? session.payment_intent
        : null;
    const status = resolveCheckoutPaymentStatus(session, paymentIntent);
    return {
      status,
      providerStatus: paymentIntent?.status ?? session.status ?? undefined,
      amountMinor: session.amount_total ?? undefined,
      currency: session.currency?.toUpperCase(),
    };
  }

  async expireCheckoutSession(providerReference: string): Promise<ExpireCheckoutSessionResult> {
    if (!this.configured) return { status: "NOT_EXPIRABLE" };
    try {
      const session = await this.client().checkout.sessions.expire(providerReference);
      return mapExpiredCheckoutSession(session);
    } catch {
      const current = await this.getPaymentStatus(providerReference);
      if (current.status === "CONFIRMED") {
        return {
          status: "CONFIRMED",
          providerStatus: current.providerStatus,
          amountMinor: current.amountMinor,
          currency: current.currency,
        };
      }
      if (current.status === "EXPIRED" || current.status === "CANCELLED" || current.status === "FAILED") {
        return { status: "EXPIRED" };
      }
      return { status: "NOT_EXPIRABLE" };
    }
  }

  async verifyWebhook(payload: Buffer, signature: string): Promise<WebhookVerifyResult> {
    if (!this.configured || !env.STRIPE_WEBHOOK_SECRET) {
      return { ok: false, reason: "NOT_CONFIGURED" };
    }
    let event: Stripe.Event;
    try {
      event = this.client().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return { ok: false, reason: "INVALID_SIGNATURE" };
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "CARD_SETUP") {
        const contractId = session.metadata.contractId;
        const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : null;
        if (!contractId || !setupIntentId) {
          return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
        }
        const setupIntent = await this.client().setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
        const method = typeof setupIntent.payment_method === "object" && setupIntent.payment_method?.type === "card"
          ? setupIntent.payment_method.card
          : null;
        if (!method || !setupIntent.payment_method || typeof setupIntent.payment_method === "string") {
          return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
        }
        return { ok: true, event: {
          kind: "CARD_SETUP",
          stripeEventId: event.id,
          eventType: event.type,
          providerReference: session.id,
          contractId,
          stripeCustomerId: typeof setupIntent.customer === "string" ? setupIntent.customer : undefined,
          stripePaymentMethodId: setupIntent.payment_method.id,
          cardBrand: method.brand,
          cardLast4: method.last4,
        }};
      }
      const paymentId = session.metadata?.paymentId;
      if (!paymentId || !session.id) {
        return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
      }
      if (session.payment_status !== "paid") {
        return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
      }
      return {
        ok: true,
        event: {
          stripeEventId: event.id,
          kind: "PAYMENT",
          eventType: event.type,
          providerReference: session.id,
          paymentId,
          status: "CONFIRMED",
          amountMinor: session.amount_total ?? undefined,
          currency: session.currency?.toUpperCase(),
        },
      };
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      if (!paymentId || !session.id) {
        return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
      }
      return {
        ok: true,
        event: {
          stripeEventId: event.id,
          kind: "PAYMENT",
          eventType: event.type,
          providerReference: session.id,
          paymentId,
          status: "EXPIRED",
        },
      };
    }

    if (
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      if (!paymentId || !session.id) {
        return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
      }
      const status =
        event.type === "checkout.session.async_payment_succeeded" ? "CONFIRMED" : "FAILED";
      if (status === "CONFIRMED" && session.payment_status !== "paid") {
        return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
      }
      return {
        ok: true,
        event: {
          stripeEventId: event.id,
          kind: "PAYMENT",
          eventType: event.type,
          providerReference: session.id,
          paymentId,
          status,
          amountMinor: session.amount_total ?? undefined,
          currency: session.currency?.toUpperCase(),
        },
      };
    }

    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const paymentId = paymentIntent.metadata?.paymentId;
      if (!paymentId || !paymentIntent.id) {
        return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
      }
      const status = event.type === "payment_intent.succeeded" ? "CONFIRMED" : "FAILED";
      return {
        ok: true,
        event: {
          stripeEventId: event.id,
          kind: "PAYMENT",
          eventType: event.type,
          providerReference: paymentIntent.id,
          paymentId,
          status,
          amountMinor: paymentIntent.amount ?? undefined,
          currency: paymentIntent.currency?.toUpperCase(),
        },
      };
    }

    // Valid Stripe events Diamond does not consume are acknowledged at the HTTP layer.
    return { ok: true, event: { kind: "IGNORED", stripeEventId: event.id, eventType: event.type } };
  }
}
