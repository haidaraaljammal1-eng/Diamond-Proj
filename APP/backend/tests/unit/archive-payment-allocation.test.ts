import { test } from "node:test";
import assert from "node:assert/strict";
import type { ArchiveRow, ContractPayment } from "@prisma/client";
import {
  buildSyncArchiveRowUpdate,
  paymentLedgerAfterPatch,
} from "src/modules/archive/archive-manual-overrides";
import {
  computeArchiveCashVisa,
  reconciliationSettlementMethod,
} from "src/modules/archive/archive-payment-allocation";

const basePayment: ContractPayment = {
  id: "p1",
  contractId: "c1",
  purpose: "RENTAL",
  targetId: "c1",
  amount: 690,
  currency: "AED",
  method: "CASH",
  status: "CONFIRMED",
  externalReference: null,
  provider: null,
  providerReference: null,
  providerStatus: null,
  checkoutUrl: null,
  checkoutExpiresAt: null,
  processingStartedAt: null,
  confirmedAt: new Date("2026-01-01"),
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

function recon(method: "CASH" | "CARD", amount = 1): ContractPayment {
  return {
    ...basePayment,
    id: `recon-${method}`,
    purpose: "RECONCILIATION",
    amount,
    method,
    confirmedAt: new Date("2026-01-02"),
  };
}

test("A — rental CASH + recon CASH + total 300 → cash 990", () => {
  const payments = [basePayment, recon("CASH")];
  assert.deepEqual(
    computeArchiveCashVisa(payments, {
      effectiveRentalTotal: 690,
      extrasTotal: 300,
    }),
    { cash: 990, visa: 0 },
  );
});

test("B — salik +50 → total 350 → cash 1040", () => {
  const payments = [basePayment, recon("CASH")];
  assert.deepEqual(
    computeArchiveCashVisa(payments, {
      effectiveRentalTotal: 690,
      extrasTotal: 350,
    }),
    { cash: 1040, visa: 0 },
  );
});

test("C — rental CASH + recon CARD + total 350", () => {
  const rental = { ...basePayment, method: "CASH" as const };
  const payments = [rental, recon("CARD")];
  assert.deepEqual(
    computeArchiveCashVisa(payments, {
      effectiveRentalTotal: 690,
      extrasTotal: 350,
    }),
    { cash: 690, visa: 350 },
  );
});

test("D — rental CARD + recon CASH + total 300", () => {
  const rental = { ...basePayment, method: "CARD" as const };
  const payments = [rental, recon("CASH")];
  assert.deepEqual(
    computeArchiveCashVisa(payments, {
      effectiveRentalTotal: 690,
      extrasTotal: 300,
    }),
    { cash: 300, visa: 690 },
  );
});

test("E — both CARD → visa 990", () => {
  const rental = { ...basePayment, method: "CARD" as const };
  const payments = [rental, recon("CARD")];
  assert.deepEqual(
    computeArchiveCashVisa(payments, {
      effectiveRentalTotal: 690,
      extrasTotal: 300,
    }),
    { cash: 0, visa: 990 },
  );
});

test("F — parking delta updates reconciliation CASH bucket only", () => {
  const payments = [basePayment, recon("CASH")];
  const before = computeArchiveCashVisa(payments, {
    effectiveRentalTotal: 690,
    extrasTotal: 300,
  });
  const after = computeArchiveCashVisa(payments, {
    effectiveRentalTotal: 690,
    extrasTotal: 350,
  });
  assert.equal(before.cash, 990);
  assert.equal(after.cash! - before.cash!, 50);
});

test("I — no RECONCILIATION: extras not allocated to cash/visa", () => {
  assert.equal(reconciliationSettlementMethod([basePayment]), null);
  assert.deepEqual(
    computeArchiveCashVisa([basePayment], {
      effectiveRentalTotal: 690,
      extrasTotal: 300,
    }),
    { cash: 690, visa: 0 },
  );
});

test("H — repeated sync merge does not double-count cash", () => {
  const payments = [basePayment, recon("CASH")];
  const auto = {
    customerName: null,
    customerPhone: null,
    days: 3,
    dailyRate: 200,
    rentalTotal: 690,
    cash: 0,
    visa: 0,
    kmOut: null,
    deliveryDate: null,
    deliveryTime: null,
    kmIn: null,
    returnDate: null,
    returnTime: null,
    km: null,
    fuel: 200,
    salik: null,
    blackPoints: 100,
    fines: null,
    total: 300,
  };
  const once = buildSyncArchiveRowUpdate(null, auto, payments);
  const twice = buildSyncArchiveRowUpdate(null, auto, payments);
  assert.equal(once.cash, 990);
  assert.equal(twice.cash, 990);
});

test("J — manual cash override preserved on sync payload", () => {
  const payments = [basePayment, recon("CASH")];
  const existing = {
    id: 1,
    vehicleId: 1,
    contractId: "c1",
    rowOrder: 1,
    manualOverrides: { cash: true },
    cash: 500,
    visa: 0,
    rentalTotal: 690,
    total: 300,
    fuel: 200,
    blackPoints: 100,
    salik: null,
    parking: null,
    fines: null,
  } as unknown as ArchiveRow;
  const auto = {
    customerName: null,
    customerPhone: null,
    days: 3,
    dailyRate: 200,
    rentalTotal: 690,
    cash: 990,
    visa: 0,
    kmOut: null,
    deliveryDate: null,
    deliveryTime: null,
    kmIn: null,
    returnDate: null,
    returnTime: null,
    km: null,
    fuel: 250,
    salik: null,
    blackPoints: 100,
    fines: null,
    total: 350,
  };
  const update = buildSyncArchiveRowUpdate(existing, auto, payments);
  assert.equal(update.cash, 500);
  assert.equal(update.visa, 0);
});

test("PATCH paymentLedgerAfterPatch uses current total", () => {
  const payments = [basePayment, recon("CARD")];
  const existing = {
    rentalTotal: 690,
    total: 300,
    fuel: 200,
    blackPoints: 100,
    salik: null,
    parking: null,
    fines: null,
  } as Parameters<typeof paymentLedgerAfterPatch>[0];
  const ledger = paymentLedgerAfterPatch(existing, { salik: 50, total: 350 }, payments);
  assert.deepEqual(ledger, { cash: 690, visa: 350 });
});
