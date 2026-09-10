import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveCustomerChargeAdjustment,
  isManualExternalReconLineType,
  mapRoadLiabilityTypeToReconLineType,
  reconciliationTotalsFromLines,
} from "src/modules/contracts/contracts-road-liability-charge";

describe("mapRoadLiabilityTypeToReconLineType", () => {
  it("maps RTA and Salik violation to VIOLATION and Salik toll to SALIK", () => {
    assert.equal(mapRoadLiabilityTypeToReconLineType("RTA_VIOLATION"), "VIOLATION");
    assert.equal(mapRoadLiabilityTypeToReconLineType("SALIK_VIOLATION"), "VIOLATION");
    assert.equal(mapRoadLiabilityTypeToReconLineType("SALIK_TOLL"), "SALIK");
  });
});

describe("isManualExternalReconLineType", () => {
  it("flags only SALIK and VIOLATION as manual external types", () => {
    assert.equal(isManualExternalReconLineType("SALIK"), true);
    assert.equal(isManualExternalReconLineType("VIOLATION"), true);
    assert.equal(isManualExternalReconLineType("DAMAGE"), false);
    assert.equal(isManualExternalReconLineType("FUEL"), false);
    assert.equal(isManualExternalReconLineType("LATE"), false);
    assert.equal(isManualExternalReconLineType("OTHER"), false);
  });
});

describe("deriveCustomerChargeAdjustment", () => {
  it("official 100 + customer 100 → adjustment 0 and no reason", () => {
    assert.deepEqual(
      deriveCustomerChargeAdjustment({ officialAmount: 100, customerChargeAmount: 100 }),
      {
        ok: true,
        officialAmount: 100,
        customerChargeAmount: 100,
        adjustmentAmount: 0,
        adjustmentReason: null,
      },
    );
  });

  it("official 100 + customer 120 → adjustment 20 with reason", () => {
    assert.deepEqual(
      deriveCustomerChargeAdjustment({
        officialAmount: 100,
        customerChargeAmount: 120,
        adjustmentReason: "Administration fee",
      }),
      {
        ok: true,
        officialAmount: 100,
        customerChargeAmount: 120,
        adjustmentAmount: 20,
        adjustmentReason: "Administration fee",
      },
    );
  });

  it("rejects customer charge below official", () => {
    assert.deepEqual(
      deriveCustomerChargeAdjustment({ officialAmount: 100, customerChargeAmount: 80 }),
      { ok: false, reason: "CUSTOMER_CHARGE_BELOW_OFFICIAL" },
    );
  });

  it("rejects an increase without a reason", () => {
    assert.deepEqual(
      deriveCustomerChargeAdjustment({ officialAmount: 100, customerChargeAmount: 120 }),
      { ok: false, reason: "ADJUSTMENT_REASON_REQUIRED" },
    );
  });
});

describe("reconciliationTotalsFromLines", () => {
  it("uses the customer charge once and does not add the official amount again", () => {
    assert.deepEqual(reconciliationTotalsFromLines([{ amount: 120 }], 500), {
      chargesTotal: 120,
      depositAmount: 500,
      deductions: 500,
      finalAmount: -380,
    });
  });
});
