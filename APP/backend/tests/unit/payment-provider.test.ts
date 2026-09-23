import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { devPaymentSimulationEnabled, requiresCardSetupBeforeSigning, setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import { StripePaymentProvider, mapPaymentIntentStatus, mapSessionStatus } from "src/modules/contracts/payment/stripe-payment.provider";
import type Stripe from "stripe";
import { UnconfiguredPaymentProvider } from "src/modules/contracts/payment/unconfigured-payment.provider";

afterEach(() => {
  setPaymentProviderForTests(undefined);
});

test("DEV payment capability is unavailable in production and restores card setup in real mode", () => {
  assert.equal(devPaymentSimulationEnabled({ nodeEnv: "production", enabled: true }), false);
  assert.equal(devPaymentSimulationEnabled({ nodeEnv: "development", enabled: false }), false);
  assert.equal(devPaymentSimulationEnabled({ nodeEnv: "development", enabled: true }), true);
  assert.equal(requiresCardSetupBeforeSigning({ nodeEnv: "development", enabled: true }), false);
  assert.equal(requiresCardSetupBeforeSigning({ nodeEnv: "production", enabled: true }), false);
});

test("unconfigured provider fails closed", async () => {
  const provider = new UnconfiguredPaymentProvider();
  assert.equal(provider.configured, false);
  const created = await provider.createCheckoutSession({
    checkoutAttemptId: "att_1",
    idempotencyKey: "diamond:stripe:checkout:att_1:v1",
    paymentId: "p1",
    contractId: "c1",
    purpose: "RENTAL",
    targetId: "c1",
    amount: 100,
    currency: "AED",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
  });
  assert.equal(created.ok, false);
  if (!created.ok) assert.equal(created.reason, "NOT_CONFIGURED");
});

test("stripe provider configured flag follows STRIPE_SECRET_KEY", async () => {
  const { env } = await import("src/config/env");
  const provider = new StripePaymentProvider();
  assert.equal(provider.configured, Boolean(env.STRIPE_SECRET_KEY));
});

test("a completed Checkout without paid status is not confirmed", () => {
  assert.equal(mapSessionStatus({ status: "complete", payment_status: "unpaid" } as Stripe.Checkout.Session), "PROCESSING");
  assert.equal(mapSessionStatus({ status: "complete", payment_status: "paid" } as Stripe.Checkout.Session), "CONFIRMED");
});

test("3DS and card retry states remain in flight", () => {
  assert.equal(mapPaymentIntentStatus("requires_action"), "PROCESSING");
  assert.equal(mapPaymentIntentStatus("requires_payment_method"), "PROCESSING");
});
