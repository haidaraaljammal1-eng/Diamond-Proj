import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uiStageFromFlowStep } from "./flow-step.ts";
import { canStartCardPayment, paymentPanelFromStatus } from "./payment-view.ts";

describe("public rental payment reachability", () => {
  it("maps SIGNED contracts to the payment stage", () => {
    assert.equal(uiStageFromFlowStep("PAYMENT"), "payment");
  });

  it("keeps FORM on contract review, not payment", () => {
    assert.equal(uiStageFromFlowStep("CONTRACT"), "contract");
  });

  it("maps PAID contracts to handover, not an active Pay CTA", () => {
    assert.equal(uiStageFromFlowStep("READY_FOR_HANDOVER"), "handover");
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

  it("shows confirmed panel when payment is settled", () => {
    assert.equal(paymentPanelFromStatus(true, "CONFIRMED"), "confirmed");
  });
});
