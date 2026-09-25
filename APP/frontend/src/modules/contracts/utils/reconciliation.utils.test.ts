import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FullReconciliationReadDto } from "../types/reconciliation.types.ts";
import {
  canCollectReconciliation,
  damageLines,
  flattenImagePairs,
  fuelLines,
  isReconciliationAwaitingPayment,
  isReconciliationEditable,
  isReconciliationPaymentFailed,
  isReconciliationPaymentPending,
  manualChargeLines,
  totalsEntries,
} from "./reconciliation.utils.ts";

const base: FullReconciliationReadDto = {
  contract: {
    contractId: "c1",
    contractNumber: "C-1",
    status: "REVIEW",
    vehicle: { id: 1, displayName: "Sedan", plateNumber: "A 1" },
  },
  custody: {
    mileageOut: 100,
    mileageIn: 120,
    mileageDifference: 20,
    fuelOut: "F",
    fuelIn: "3/4",
    fuelDifference: 1,
  },
  imagePairs: [
    {
      angle: "FRONT",
      outPhoto: { id: "o1", url: "/out" },
      inPhoto: { id: "i1", url: "/in" },
    },
  ],
  lines: [
    {
      id: "l1",
      type: "DAMAGE",
      description: "Door",
      amount: 200,
      roadLiabilityId: null,
      externalReference: null,
      officialAmountSnapshot: null,
      adjustmentAmount: null,
      adjustmentReason: null,
    },
  ],
  roadLiabilities: { attached: [], available: [] },
  totals: {
    damages: 200,
    fuel: 0,
    late: 0,
    other: 0,
    salik: 0,
    violations: 0,
    finalAmount: 200,
  },
  reconciliation: {
    id: "r1",
    approvedAt: null,
    finalizedAt: null,
    finalizedByUserId: null,
    settledAt: null,
    settled: false,
  },
  paymentLink: { active: false, expiresAt: null },
  collection: { paymentStatus: null, paymentMethod: null },
};

describe("reconciliation.utils", () => {
  it("derives editable and awaiting payment states from backend metadata", () => {
    assert.equal(isReconciliationEditable(base), true);
    assert.equal(isReconciliationAwaitingPayment(base), false);
    assert.equal(canCollectReconciliation(base), true);

    const locked = {
      ...base,
      reconciliation: { ...base.reconciliation, finalizedAt: "2026-01-01T00:00:00.000Z" },
    };
    assert.equal(isReconciliationEditable(locked), false);
    assert.equal(isReconciliationAwaitingPayment(locked), true);
    assert.equal(canCollectReconciliation(locked), true);
  });

  it("keeps collect available until settled and hides it after settlement", () => {
    const settled = {
      ...base,
      reconciliation: {
        ...base.reconciliation,
        finalizedAt: "2026-01-01T00:00:00.000Z",
        settledAt: "2026-01-02T00:00:00.000Z",
        settled: true,
      },
    };
    assert.equal(canCollectReconciliation(settled), false);
    assert.equal(isReconciliationEditable(settled), false);
  });

  it("tracks pending and failed electronic payment states from backend collection", () => {
    const pending = {
      ...base,
      reconciliation: { ...base.reconciliation, finalizedAt: "2026-01-01T00:00:00.000Z" },
      collection: { paymentStatus: "PROCESSING", paymentMethod: "CARD" },
    };
    assert.equal(isReconciliationPaymentPending(pending), true);
    assert.equal(isReconciliationPaymentFailed(pending), false);

    const failed = {
      ...pending,
      collection: { paymentStatus: "FAILED", paymentMethod: "CARD" },
    };
    assert.equal(isReconciliationPaymentFailed(failed), true);
  });

  it("pairs images by backend angle and filters damage lines", () => {
    assert.equal(damageLines(base.lines).length, 1);
    assert.deepEqual(flattenImagePairs(base.imagePairs).map((item) => item.stage), ["OUT", "IN"]);
  });

  it("lists only non-zero totals from backend breakdown", () => {
    assert.deepEqual(totalsEntries(base.totals).map((entry) => entry.key), ["damages"]);
  });

  it("treats zero unsettled draft as editable and not collectable", () => {
    const zeroDraft = {
      ...base,
      lines: [],
      totals: {
        damages: 0,
        fuel: 0,
        late: 0,
        other: 0,
        salik: 0,
        violations: 0,
        finalAmount: 0,
      },
      reconciliation: { ...base.reconciliation, settled: false },
    };
    assert.equal(isReconciliationEditable(zeroDraft), true);
    assert.equal(canCollectReconciliation(zeroDraft), false);
    assert.equal(fuelLines(zeroDraft.lines).length, 0);
    assert.equal(manualChargeLines(zeroDraft.lines).length, 0);
  });
});
