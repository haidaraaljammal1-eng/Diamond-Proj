import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRetryPayment,
  canStartCardPayment,
  paymentPanelFromStatus,
} from "./payment-view.ts";

describe("paymentPanelFromStatus", () => {
  it("never treats an unconfigured provider as ready", () => {
    assert.equal(paymentPanelFromStatus(false, null), "unavailable");
  });

  it("maps backend attempt statuses", () => {
    assert.equal(paymentPanelFromStatus(true, "PROCESSING"), "processing");
    assert.equal(paymentPanelFromStatus(true, "PENDING"), "pending");
    assert.equal(paymentPanelFromStatus(true, "FAILED"), "failed");
    assert.equal(paymentPanelFromStatus(true, "CANCELLED"), "cancelled");
    assert.equal(paymentPanelFromStatus(true, "CONFIRMED"), "confirmed");
    assert.equal(paymentPanelFromStatus(true, null), "ready");
  });
});

describe("canStartCardPayment", () => {
  it("requires a linked card before starting a real payment", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        cardLinked: false,
        paymentStatus: null,
        payPending: false,
      }),
      false,
    );
  });
  it("disables Pay when the provider is unavailable", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: false,
        cardLinked: true,
        paymentStatus: null,
        payPending: false,
      }),
      false,
    );
  });

  it("blocks a new attempt while PROCESSING or PENDING", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        cardLinked: true,
        paymentStatus: "PROCESSING",
        payPending: false,
      }),
      false,
    );
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        cardLinked: true,
        paymentStatus: "PENDING",
        payPending: false,
      }),
      false,
    );
  });

  it("allows retry after FAILED when the provider is configured", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        cardLinked: true,
        paymentStatus: "FAILED",
        payPending: false,
      }),
      true,
    );
    assert.equal(canRetryPayment("FAILED"), true);
    assert.equal(canRetryPayment("PENDING"), false);
  });
});
