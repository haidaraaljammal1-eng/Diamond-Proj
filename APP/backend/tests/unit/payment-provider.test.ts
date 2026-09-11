import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import { StripePaymentProvider } from "src/modules/contracts/payment/stripe-payment.provider";
import { UnconfiguredPaymentProvider } from "src/modules/contracts/payment/unconfigured-payment.provider";

afterEach(() => {
  setPaymentProviderForTests(undefined);
});

test("unconfigured provider fails closed", async () => {
  const provider = new UnconfiguredPaymentProvider();
  assert.equal(provider.configured, false);
  const created = await provider.createCheckoutSession({
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

test("stripe provider is not configured without credentials", () => {
  const provider = new StripePaymentProvider();
  assert.equal(provider.configured, false);
});
