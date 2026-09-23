import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getPaymentConsent,
  listActivePaymentConsents,
  OFF_SESSION_ELIGIBLE_CONSENT_SCOPES,
  PAYMENT_CONSENT_SCOPE_V1,
  PAYMENT_CONSENT_SCOPE_V2,
  PAYMENT_METHOD_AUTHORIZATION_VERSION,
  PAYMENT_METHOD_AUTHORIZATION_VERSION_V1,
  PAYMENT_METHOD_AUTHORIZATION_VERSION_V2,
} from "src/modules/contracts/payment/payment-consent.catalog";
import { buildStripePaymentCheckoutParams } from "src/modules/contracts/payment/stripe-payment.provider";

const baseInput = {
  checkoutAttemptId: "att_1",
  idempotencyKey: "diamond:stripe:checkout:att_1:v1",
  paymentId: "pay_1",
  contractId: "ctr_1",
  purpose: "RENTAL" as const,
  targetId: "ctr_1",
  amount: 100,
  currency: "AED",
  successUrl: "https://example.test/success",
  cancelUrl: "https://example.test/cancel",
};

test("new rental authorizations default to consent v2", () => {
  assert.equal(PAYMENT_METHOD_AUTHORIZATION_VERSION, PAYMENT_METHOD_AUTHORIZATION_VERSION_V2);
});

test("v1 consent scope is not eligible for road-liability off-session", () => {
  assert.ok(!OFF_SESSION_ELIGIBLE_CONSENT_SCOPES.includes(PAYMENT_CONSENT_SCOPE_V1 as never));
});

test("v2 consent scope is eligible for road-liability off-session", () => {
  assert.ok(OFF_SESSION_ELIGIBLE_CONSENT_SCOPES.includes(PAYMENT_CONSENT_SCOPE_V2 as never));
});

test("active consent catalog serves v2 only", () => {
  const active = listActivePaymentConsents();
  assert.ok(active.length >= 2);
  assert.ok(active.every((entry) => entry.version === PAYMENT_METHOD_AUTHORIZATION_VERSION_V2));
  assert.ok(active.every((entry) => entry.scope === PAYMENT_CONSENT_SCOPE_V2));
});

test("v1 consent remains historical and is not served as active", () => {
  assert.equal(getPaymentConsent(PAYMENT_METHOD_AUTHORIZATION_VERSION_V1, "en"), null);
  assert.equal(getPaymentConsent(PAYMENT_METHOD_AUTHORIZATION_VERSION_V1, "ar"), null);
});

test("stripe checkout omits setup_future_usage without customer consent", () => {
  const params = buildStripePaymentCheckoutParams(baseInput, 10000);
  assert.equal(params.mode, "payment");
  assert.equal(params.payment_method_collection, undefined);
  assert.equal(params.customer, undefined);
  assert.equal(params.payment_intent_data?.setup_future_usage, undefined);
  assert.equal(params.payment_intent_data?.metadata?.paymentId, "pay_1");
  assert.equal(params.metadata?.savePaymentMethodForFutureUse, "false");
});

test("stripe checkout enables off_session future use only when consented", () => {
  const params = buildStripePaymentCheckoutParams(
    {
      ...baseInput,
      savePaymentMethodForFutureUse: true,
      stripeCustomerId: "cus_test_123",
    },
    10000,
  );
  assert.equal(params.mode, "payment");
  assert.equal(params.customer, "cus_test_123");
  assert.equal(params.payment_method_collection, undefined);
  assert.equal(params.payment_intent_data?.setup_future_usage, "off_session");
  assert.equal(params.payment_intent_data?.metadata?.paymentId, "pay_1");
  assert.equal(params.metadata?.savePaymentMethodForFutureUse, "true");
});

test("payment mode never sets payment_method_collection if_required", () => {
  const consentOff = buildStripePaymentCheckoutParams(baseInput, 10000);
  const consentOn = buildStripePaymentCheckoutParams(
    {
      ...baseInput,
      savePaymentMethodForFutureUse: true,
      stripeCustomerId: "cus_test_123",
    },
    10000,
  );
  const withSavedCustomer = buildStripePaymentCheckoutParams(
    {
      ...baseInput,
      savedPaymentMethod: {
        stripeCustomerId: "cus_saved_456",
        stripePaymentMethodId: "pm_123",
      },
    },
    10000,
  );
  for (const params of [consentOff, consentOn, withSavedCustomer]) {
    assert.equal(params.mode, "payment");
    assert.notEqual(
      params.payment_method_collection,
      "if_required",
      "payment_method_collection if_required is invalid in payment mode",
    );
  }
});

test("payment consent catalog serves locale-specific authoritative copy", () => {
  const ar = getPaymentConsent(PAYMENT_METHOD_AUTHORIZATION_VERSION_V2, "ar");
  const en = getPaymentConsent(PAYMENT_METHOD_AUTHORIZATION_VERSION_V2, "en");
  assert.ok(ar?.text.includes("أوافق"));
  assert.ok(en?.text.toLowerCase().includes("authorize"));
  assert.notEqual(ar?.text, en?.text);
  assert.equal(ar?.locale, "ar");
  assert.equal(en?.locale, "en");
});
