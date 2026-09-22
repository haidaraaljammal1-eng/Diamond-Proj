import assert from "node:assert/strict";
import { test } from "node:test";
import { PAYMENT_METHOD_AUTHORIZATION_VERSION } from "src/modules/contracts/payment/payment-consent.constants";
import { buildStripePaymentCheckoutParams } from "src/modules/contracts/payment/stripe-payment.provider";

const baseInput = {
  paymentId: "pay_1",
  contractId: "ctr_1",
  purpose: "RENTAL" as const,
  targetId: "ctr_1",
  amount: 100,
  currency: "AED",
  successUrl: "https://example.test/success",
  cancelUrl: "https://example.test/cancel",
};

test("payment method authorization consent uses a stable version key", () => {
  assert.equal(PAYMENT_METHOD_AUTHORIZATION_VERSION, "payment_method_authorization_v1");
});

test("stripe checkout omits setup_future_usage without customer consent", () => {
  const params = buildStripePaymentCheckoutParams(baseInput, 10000);
  assert.equal(params.payment_intent_data, undefined);
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
  assert.deepEqual(params.payment_intent_data, { setup_future_usage: "off_session" });
  assert.equal(params.customer, "cus_test_123");
  assert.equal(params.metadata?.savePaymentMethodForFutureUse, "true");
});
