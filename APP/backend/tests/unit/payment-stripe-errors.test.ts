import assert from "node:assert/strict";
import { test } from "node:test";
import { isAppError } from "src/lib/errors/app-error";
import {
  stripeCheckoutErrorContext,
  throwMappedStripeCheckoutError,
} from "src/modules/contracts/payment/payment-stripe-errors";

function stripeError(partial: {
  type: string;
  code?: string;
  param?: string;
  requestId?: string;
  statusCode?: number;
}) {
  return Object.assign(new Error("stripe"), partial);
}

test("StripeInvalidRequestError maps to PAYMENT_CHECKOUT_CONFIGURATION_ERROR", () => {
  try {
    throwMappedStripeCheckoutError(
      stripeError({
        type: "StripeInvalidRequestError",
        code: "parameter_unknown",
        param: "payment_method_collection",
        requestId: "req_test_123",
      }),
    );
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(isAppError(error));
    assert.equal(error.statusCode, 409);
    assert.equal(error.context?.reason, "PAYMENT_CHECKOUT_CONFIGURATION_ERROR");
    assert.equal(error.message, "Unable to prepare the payment right now. Please try again.");
    assert.equal(error.context?.stripeType, "StripeInvalidRequestError");
    assert.equal(error.context?.stripeParam, "payment_method_collection");
    assert.equal(error.context?.stripeRequestId, "req_test_123");
  }
});

test("StripeIdempotencyError still maps to recovery failed", () => {
  try {
    throwMappedStripeCheckoutError(stripeError({ type: "StripeIdempotencyError" }));
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(isAppError(error));
    assert.equal(error.context?.reason, "PAYMENT_ATTEMPT_RECOVERY_FAILED");
  }
});

test("stripeCheckoutErrorContext omits unsafe fields", () => {
  const ctx = stripeCheckoutErrorContext(
    stripeError({
      type: "StripeInvalidRequestError",
      code: "parameter_unknown",
      param: "customer",
      requestId: "req_abc",
    }) as import("stripe").Stripe.errors.StripeError,
  );
  assert.deepEqual(ctx, {
    stripeType: "StripeInvalidRequestError",
    stripeCode: "parameter_unknown",
    stripeParam: "customer",
    stripeRequestId: "req_abc",
  });
});
