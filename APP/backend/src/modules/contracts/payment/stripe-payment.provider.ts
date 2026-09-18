import Stripe from "stripe";
import { env } from "src/config/env";
import { aedToStripeMinorUnits, assertAedCurrency } from "src/modules/contracts/payment/money";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  CreateCardSetupInput,
  CreateCardSetupResult,
  PaymentProvider,
  PaymentStatusResult,
  ProviderPaymentStatus,
  WebhookVerifyResult,
} from "src/modules/contracts/payment/payment-provider.types";

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

export function mapPaymentIntentStatus(status: Stripe.PaymentIntent.Status | null): ProviderPaymentStatus {
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

/**
 * Production Stripe adapter. When credentials are missing, configured=false and
 * every call fails closed — no fake URLs or confirmed payments.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly configured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

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
    if (input.savedPaymentMethod?.stripeCustomerId) {
      params.customer = input.savedPaymentMethod.stripeCustomerId;
      params.payment_method_collection = "if_required";
    }
    const session = await this.client().checkout.sessions.create(params);
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

  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    if (!this.configured) return { status: "UNKNOWN" };
    const session = await this.client().checkout.sessions.retrieve(providerReference, {
      expand: ["payment_intent"],
    });
    const paymentIntent =
      typeof session.payment_intent === "object" && session.payment_intent
        ? session.payment_intent
        : null;
    const status = session.status === "expired"
      ? "EXPIRED"
      : paymentIntent
        ? mapPaymentIntentStatus(paymentIntent.status)
        : mapSessionStatus(session);
    return {
      status,
      providerStatus: paymentIntent?.status ?? session.status ?? undefined,
      amountMinor: session.amount_total ?? undefined,
      currency: session.currency?.toUpperCase(),
    };
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
        if (!contractId || !setupIntentId) return { ok: false, reason: "IGNORED" };
        const setupIntent = await this.client().setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
        const method = typeof setupIntent.payment_method === "object" && setupIntent.payment_method?.type === "card"
          ? setupIntent.payment_method.card
          : null;
        if (!method || !setupIntent.payment_method || typeof setupIntent.payment_method === "string") return { ok: false, reason: "IGNORED" };
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
      if (!paymentId || !session.id) return { ok: false, reason: "IGNORED" };
      if (session.payment_status !== "paid") return { ok: false, reason: "IGNORED" };
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
      if (!paymentId || !session.id) return { ok: false, reason: "IGNORED" };
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

    return { ok: false, reason: "IGNORED" };
  }
}
