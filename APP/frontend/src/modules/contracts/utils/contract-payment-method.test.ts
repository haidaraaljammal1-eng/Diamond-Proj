import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contractPaymentMethodLabel } from "./contract-payment-method.ts";

describe("contractPaymentMethodLabel", () => {
  it("maps CASH to the payment.method.CASH translation key", () => {
    const labels: Record<string, string> = {
      "payment.method.CASH": "Cash / Card Machine",
    };
    assert.equal(
      contractPaymentMethodLabel("CASH", (key) => labels[key] ?? key),
      "Cash / Card Machine",
    );
  });
});
