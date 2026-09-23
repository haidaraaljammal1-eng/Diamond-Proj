import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import {
  PAYMENT_PROVIDER_RECONCILE_COOLDOWN_MS,
  markPaymentProviderReconciled,
  resetPaymentProviderReconcileCooldown,
  shouldReconcilePaymentWithProvider,
} from "src/modules/contracts/payment/payment-reconcile-policy";

function candidate(overrides: Partial<Parameters<typeof shouldReconcilePaymentWithProvider>[0]> = {}) {
  return {
    id: "pay_1",
    status: "PROCESSING" as const,
    providerReference: "cs_test_1",
    checkoutExpiresAt: new Date(Date.now() + 60_000),
    processingStartedAt: new Date(),
    failedAt: null,
    confirmedAt: null,
    ...overrides,
  };
}

beforeEach(() => resetPaymentProviderReconcileCooldown());

test("CONFIRMED payment is never reconciled", () => {
  assert.equal(
    shouldReconcilePaymentWithProvider(
      candidate({ status: "CONFIRMED", confirmedAt: new Date() }),
    ),
    false,
  );
});

test("FAILED payment is never reconciled", () => {
  assert.equal(
    shouldReconcilePaymentWithProvider(candidate({ status: "FAILED", failedAt: new Date() })),
    false,
  );
});

test("PROCESSING payment without providerReference is never reconciled", () => {
  assert.equal(shouldReconcilePaymentWithProvider(candidate({ providerReference: null })), false);
});

test("PROCESSING payment reconciles once, then respects cooldown", () => {
  const now = 1_700_000_000_000;
  const payment = candidate();
  assert.equal(shouldReconcilePaymentWithProvider(payment, now), true);
  markPaymentProviderReconciled(payment.id, now);
  assert.equal(shouldReconcilePaymentWithProvider(payment, now + 1_000), false);
  assert.equal(
    shouldReconcilePaymentWithProvider(payment, now + PAYMENT_PROVIDER_RECONCILE_COOLDOWN_MS),
    true,
  );
});
