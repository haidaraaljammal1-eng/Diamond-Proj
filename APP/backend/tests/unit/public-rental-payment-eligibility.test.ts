import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivePublicRentalFlowStep } from "src/modules/contracts/public-rental-flow";

describe("public rental payment eligibility", () => {
  it("shows PAYMENT for SIGNED contracts awaiting rental payment", () => {
    assert.equal(
      derivePublicRentalFlowStep({
        status: "SIGNED",
        identityReady: true,
        paymentStatus: null,
      }),
      "PAYMENT",
    );
  });

  it("blocks payment flow before signature", () => {
    assert.equal(
      derivePublicRentalFlowStep({
        status: "FORM",
        identityReady: true,
        paymentStatus: null,
      }),
      "CONTRACT",
    );
    assert.equal(
      derivePublicRentalFlowStep({
        status: "AWAITING",
        identityReady: false,
        paymentStatus: null,
      }),
      "LICENSE_VERIFICATION",
    );
  });

  it("moves to handover after PAID", () => {
    assert.equal(
      derivePublicRentalFlowStep({
        status: "PAID",
        identityReady: true,
        paymentStatus: "CONFIRMED",
      }),
      "READY_FOR_HANDOVER",
    );
  });
});
