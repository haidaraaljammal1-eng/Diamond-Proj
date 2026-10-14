import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeArchiveTotal,
  computeDailyRate,
  recomputeArchiveAutoFields,
  sumDamage,
  sumRoadCharges,
} from "src/modules/archive/archive-sync.recompute";
import { computeArchiveCashVisa } from "src/modules/archive/archive-payment-allocation";

const basePayment = {
  id: "p1",
  contractId: "c1",
  purpose: "RENTAL" as const,
  targetId: "c1",
  amount: 500,
  currency: "AED",
  method: "CASH" as const,
  status: "CONFIRMED" as const,
  externalReference: null,
  provider: null,
  providerReference: null,
  providerStatus: null,
  checkoutUrl: null,
  checkoutExpiresAt: null,
  processingStartedAt: null,
  confirmedAt: new Date(),
  failedAt: null,
  statusTokenHash: null,
  statusTokenExpiresAt: null,
  savePaymentMethodForFutureUse: false,
  futureUseConsentAt: null,
  futureUseConsentVersion: null,
  futureUseConsentLocale: null,
  createdAt: new Date(),
  createdByUserId: null,
};

const baseReconLine = {
  id: "l1",
  reconciliationId: "r1",
  description: "x",
  externalReference: null,
  sourceDomain: null,
  roadLiabilityId: null,
  officialAmountSnapshot: null,
  adjustmentAmount: null,
  adjustmentReason: null,
  adjustmentNote: null,
  confirmedByUserId: null,
  confirmedAt: null,
  createdAt: new Date(),
};

function recompute(overrides: Partial<Parameters<typeof recomputeArchiveAutoFields>[0]> = {}) {
  return recomputeArchiveAutoFields({
    contractId: "c1",
    rentalDays: 5,
    agreedAmount: 500,
    snapshot: null,
    customer: { name: "A", mobile: null },
    carOut: null,
    carIn: null,
    payments: [],
    reconciliationLines: [],
    roadCharges: [],
    businessTimezoneOffsetMinutes: 240,
    parkingForTotal: null,
    includeCustomer: true,
    ...overrides,
  });
}

test("computeDailyRate divides agreed amount by rental days", () => {
  assert.equal(computeDailyRate(3000, 10), 300);
  assert.equal(computeDailyRate(1000, 0), null);
});

test("recompute total includes rental, fuel, salik, parking, damage, fines", () => {
  const result = recompute({
    payments: [basePayment],
    reconciliationLines: [
      { ...baseReconLine, id: "f1", type: "FUEL", amount: 200 },
      { ...baseReconLine, id: "d1", type: "DAMAGE", amount: 300 },
      { ...baseReconLine, id: "d2", type: "DAMAGE", amount: 400 },
    ],
    parkingForTotal: 30,
    roadCharges: [
      {
        id: "ch1",
        roadLiabilityId: "rl1",
        contractId: "c1",
        destinationType: "RECONCILIATION",
        officialAmountSnapshot: 50,
        customerChargeAmount: 50,
        adjustmentAmount: 0,
        adjustmentReason: null,
        adjustmentNote: null,
        confirmedByUserId: null,
        confirmedAt: new Date(),
        reconciliationLineId: null,
        operationalState: null,
        settlementChannel: null,
        contractPaymentId: null,
        manualSelectedByUserId: null,
        manualSelectedAt: null,
        manualConfirmedByUserId: null,
        manualConfirmedAt: null,
        manualCollectionStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        roadLiability: {
          type: "RTA_VIOLATION",
          attributionStatus: "MATCHED",
          attributedContractId: "c1",
        },
      },
      {
        id: "ch2",
        roadLiabilityId: "rl2",
        contractId: "c1",
        destinationType: "RECONCILIATION",
        officialAmountSnapshot: 50,
        customerChargeAmount: 50,
        adjustmentAmount: 0,
        adjustmentReason: null,
        adjustmentNote: null,
        confirmedByUserId: null,
        confirmedAt: new Date(),
        reconciliationLineId: null,
        operationalState: null,
        settlementChannel: null,
        contractPaymentId: null,
        manualSelectedByUserId: null,
        manualSelectedAt: null,
        manualConfirmedByUserId: null,
        manualConfirmedAt: null,
        manualCollectionStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        roadLiability: {
          type: "SALIK_TOLL",
          attributionStatus: "MATCHED",
          attributedContractId: "c1",
        },
      },
    ],
  });

  assert.equal(result.rentalTotal, 500);
  assert.equal(result.fuel, 200);
  assert.equal(result.salik, 50);
  assert.equal(result.blackPoints, 700);
  assert.equal(result.fines, 50);
  assert.equal(result.total, 1030);
});

test("computeArchiveTotal treats null components as zero when any charge exists", () => {
  assert.equal(
    computeArchiveTotal({
      fuel: 200,
      salik: null,
      parking: null,
      blackPoints: null,
      fines: null,
    }),
    200,
  );
});

test("sumDamage aggregates DAMAGE lines only", () => {
  assert.equal(
    sumDamage([
      { ...baseReconLine, type: "DAMAGE", amount: 300 },
      { ...baseReconLine, id: "2", type: "DAMAGE", amount: 400 },
      { ...baseReconLine, id: "3", type: "FUEL", amount: 99 },
    ]),
    700,
  );
  assert.equal(sumDamage([]), null);
});

test("damage removal recomputes from source (no accumulation)", () => {
  const once = recompute({
    reconciliationLines: [{ ...baseReconLine, type: "DAMAGE", amount: 700 }],
  });
  assert.equal(once.blackPoints, 700);
  const after = recompute({
    reconciliationLines: [{ ...baseReconLine, type: "DAMAGE", amount: 600 }],
  });
  assert.equal(after.blackPoints, 600);
});

test("cash and visa payment columns do not change extras total", () => {
  const cashRental = recompute({
    payments: [{ ...basePayment, amount: 500, method: "CASH" }],
    reconciliationLines: [{ ...baseReconLine, type: "FUEL", amount: 100 }],
  });
  const cardRental = recompute({
    payments: [{ ...basePayment, amount: 500, method: "CARD" }],
    reconciliationLines: [{ ...baseReconLine, type: "FUEL", amount: 100 }],
  });
  assert.equal(cashRental.cash, 500);
  assert.equal(cardRental.visa, 500);
  assert.equal(cashRental.total, 100);
  assert.equal(cardRental.total, 100);
});

test("parkingForTotal is included in total but not written by recompute object", () => {
  const result = recompute({
    payments: [{ ...basePayment, amount: 100 }],
    parkingForTotal: 50,
  });
  assert.equal(result.total, 50);
});

test("sumRoadCharges separates RTA and Salik", () => {
  const base = {
    id: "ch",
    roadLiabilityId: "rl",
    contractId: "c1",
    destinationType: "RECONCILIATION" as const,
    officialAmountSnapshot: 10,
    customerChargeAmount: 15,
    adjustmentAmount: 5,
    adjustmentReason: null,
    adjustmentNote: null,
    confirmedByUserId: null,
    confirmedAt: new Date(),
    reconciliationLineId: null,
    operationalState: null,
    settlementChannel: null,
    contractPaymentId: null,
    manualSelectedByUserId: null,
    manualSelectedAt: null,
    manualConfirmedByUserId: null,
    manualConfirmedAt: null,
    manualCollectionStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { fines, salik } = sumRoadCharges(
    [
      {
        ...base,
        id: "1",
        roadLiability: {
          type: "RTA_VIOLATION",
          attributionStatus: "MATCHED",
          attributedContractId: "c1",
        },
      },
      {
        ...base,
        id: "2",
        customerChargeAmount: 20,
        roadLiability: {
          type: "SALIK_TOLL",
          attributionStatus: "MATCHED",
          attributedContractId: "c1",
        },
      },
      {
        ...base,
        id: "3",
        customerChargeAmount: 30,
        roadLiability: {
          type: "SALIK_VIOLATION",
          attributionStatus: "MATCHED",
          attributedContractId: "c1",
        },
      },
    ],
    "c1",
  );
  assert.equal(fines, 15);
  assert.equal(salik, 50);
});

test("fuel from reconciliation FUEL lines", () => {
  const result = recompute({
    reconciliationLines: [{ ...baseReconLine, type: "FUEL", amount: 120 }],
  });
  assert.equal(result.fuel, 120);
});

test("example extras total 680 from spec", () => {
  assert.equal(
    computeArchiveTotal({
      fuel: 200,
      salik: 50,
      parking: 30,
      blackPoints: 300,
      fines: 100,
    }),
    680,
  );
});

test("recompute cash/visa uses current extras total + recon method", () => {
  const rental = { ...basePayment, amount: 600, method: "CASH" as const };
  const recon = {
    ...basePayment,
    id: "r2",
    purpose: "RECONCILIATION" as const,
    amount: 1,
    method: "CARD" as const,
    confirmedAt: new Date(),
  };
  const synced = recompute({
    payments: [rental, recon],
    reconciliationLines: [{ ...baseReconLine, type: "FUEL", amount: 100 }],
  });
  assert.equal(synced.rentalTotal, 600);
  assert.equal(synced.total, 100);
  assert.equal(synced.cash, 600);
  assert.equal(synced.visa, 100);
});

test("computeArchiveCashVisa ignores reconciliation payment amount", () => {
  const rental = { ...basePayment, amount: 600, method: "CASH" as const };
  const recon = {
    ...basePayment,
    id: "r2",
    purpose: "RECONCILIATION" as const,
    amount: 9999,
    method: "CARD" as const,
  };
  assert.deepEqual(
    computeArchiveCashVisa([rental, recon], {
      effectiveRentalTotal: 600,
      extrasTotal: 300,
    }),
    { cash: 600, visa: 300 },
  );
});
