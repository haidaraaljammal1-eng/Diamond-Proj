import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapPaymentIntentStatus,
  resolveCheckoutPaymentStatus,
} from "src/modules/contracts/payment/stripe-payment.provider";

test("declined card maps requires_payment_method with last_payment_error to FAILED", () => {
  assert.equal(
    mapPaymentIntentStatus("requires_payment_method", {
      lastPaymentError: { code: "card_declined", message: "Your card was declined.", type: "card_error" },
    }),
    "FAILED",
  );
});

test("fresh checkout intent without error stays PROCESSING", () => {
  assert.equal(mapPaymentIntentStatus("requires_payment_method"), "PROCESSING");
});

test("completed checkout without paid status stays in flight", () => {
  assert.equal(
    resolveCheckoutPaymentStatus({ status: "complete", payment_status: "unpaid" }, null),
    "PROCESSING",
  );
  assert.equal(
    resolveCheckoutPaymentStatus({ status: "complete", payment_status: "paid" }, null),
    "CONFIRMED",
  );
});

test("open checkout session with failed intent reconciles to FAILED", () => {
  assert.equal(
    resolveCheckoutPaymentStatus(
      { status: "open", payment_status: "unpaid" },
      {
        status: "requires_payment_method",
        last_payment_error: { code: "card_declined", message: "declined", type: "card_error" },
      },
    ),
    "FAILED",
  );
});
