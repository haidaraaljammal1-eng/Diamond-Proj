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
  it("allows Pay on SIGNED contracts without a pre-linked card", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: null,
        payPending: false,
        contractStatus: "SIGNED",
      }),
      true,
    );
  });

  it("blocks Pay before SIGNED", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: null,
        payPending: false,
        contractStatus: "FORM",
      }),
      false,
    );
  });

  it("disables Pay when the provider is unavailable", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: false,
        paymentStatus: null,
        payPending: false,
        contractStatus: "SIGNED",
      }),
      false,
    );
  });

  it("blocks a new attempt while PROCESSING or PENDING", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: "PROCESSING",
        payPending: false,
        contractStatus: "SIGNED",
      }),
      false,
    );
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: "PENDING",
        payPending: false,
        contractStatus: "SIGNED",
      }),
      false,
    );
  });

  it("blocks duplicate clicks while pay is pending", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: null,
        payPending: true,
        contractStatus: "SIGNED",
      }),
      false,
    );
  });

  it("allows retry after FAILED when the provider is configured", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: "FAILED",
        payPending: false,
        contractStatus: "SIGNED",
      }),
      true,
    );
    assert.equal(canRetryPayment("FAILED"), true);
    assert.equal(canRetryPayment("PENDING"), false);
  });

  it("does not offer Pay on PAID contracts", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: "CONFIRMED",
        payPending: false,
        contractStatus: "PAID",
      }),
      false,
    );
  });

  it("does not offer Pay on ACTIVE contracts", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: null,
        payPending: false,
        contractStatus: "ACTIVE",
      }),
      false,
    );
  });

  it("allows retry after CANCELLED attempts", () => {
    assert.equal(
      canStartCardPayment({
        providerAvailable: true,
        paymentStatus: "CANCELLED",
        payPending: false,
        contractStatus: "SIGNED",
      }),
      true,
    );
    assert.equal(canRetryPayment("CANCELLED"), true);
  });
});
