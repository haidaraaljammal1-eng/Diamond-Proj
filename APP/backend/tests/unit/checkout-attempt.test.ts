import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCheckoutRequestFingerprint } from "src/modules/contracts/payment/payment-attempt-fingerprint";
import { stripeCheckoutAttemptIdempotencyKey } from "src/modules/contracts/payment/stripe-payment-profile.service";
import { buildPaymentCallbackUrls } from "src/modules/contracts/payment/payment-callback-urls";
import { rejectUntrustedRedirectUrl } from "src/modules/contracts/payment/payment-callback-urls";

const base = {
  amount: 7084,
  currency: "AED",
  contractId: "ctr-1",
  purpose: "RENTAL" as const,
  targetId: "ctr-1",
  companyCode: "DE",
  savePaymentMethodForFutureUse: false,
  consentVersion: null,
  stripeCustomerId: null,
};

test("checkout fingerprint is stable for identical material parameters", () => {
  const { successUrl, cancelUrl } = buildPaymentCallbackUrls("tok_stable", "en");
  const a = buildCheckoutRequestFingerprint({ ...base, successUrl, cancelUrl });
  const b = buildCheckoutRequestFingerprint({ ...base, successUrl, cancelUrl });
  assert.equal(a, b);
});

test("checkout fingerprint changes when success_url changes", () => {
  const u1 = buildPaymentCallbackUrls("tok_a", "en");
  const u2 = buildPaymentCallbackUrls("tok_b", "en");
  const a = buildCheckoutRequestFingerprint({ ...base, ...u1 });
  const b = buildCheckoutRequestFingerprint({ ...base, ...u2 });
  assert.notEqual(a, b);
});

test("stripe checkout idempotency key is tied to attempt id only", () => {
  assert.equal(
    stripeCheckoutAttemptIdempotencyKey("att-123"),
    "diamond:stripe:checkout:att-123:v1",
  );
});

test("rejectUntrustedRedirectUrl blocks external origins", () => {
  assert.throws(() => rejectUntrustedRedirectUrl("https://evil.example/phish"));
});
