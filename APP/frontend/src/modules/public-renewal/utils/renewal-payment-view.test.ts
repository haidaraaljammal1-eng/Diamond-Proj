import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  canRetryRenewalPayment,
  canStartRenewalPayment,
  renewalPaymentPanelFromStatus,
} from "./renewal-payment-view.ts";

describe("renewalPaymentPanelFromStatus", () => {
  test("unavailable when provider is not configured", () => {
    assert.equal(renewalPaymentPanelFromStatus(false, null), "unavailable");
  });

  test("maps provider statuses", () => {
    assert.equal(renewalPaymentPanelFromStatus(true, "PROCESSING"), "processing");
    assert.equal(renewalPaymentPanelFromStatus(true, "CONFIRMED"), "confirmed");
    assert.equal(renewalPaymentPanelFromStatus(true, null), "ready");
  });
});

describe("canStartRenewalPayment", () => {
  test("requires awaiting payment and available provider", () => {
    assert.equal(
      canStartRenewalPayment({
        providerAvailable: true,
        paymentStatus: null,
        payPending: false,
        awaitingPayment: true,
      }),
      true,
    );
    assert.equal(
      canStartRenewalPayment({
        providerAvailable: false,
        paymentStatus: null,
        payPending: false,
        awaitingPayment: true,
      }),
      false,
    );
    assert.equal(
      canStartRenewalPayment({
        providerAvailable: true,
        paymentStatus: "CONFIRMED",
        payPending: false,
        awaitingPayment: true,
      }),
      false,
    );
  });
});

describe("canRetryRenewalPayment", () => {
  test("allows retry after failed or cancelled attempts", () => {
    assert.equal(canRetryRenewalPayment("FAILED"), true);
    assert.equal(canRetryRenewalPayment("CANCELLED"), true);
    assert.equal(canRetryRenewalPayment("PROCESSING"), false);
  });
});
