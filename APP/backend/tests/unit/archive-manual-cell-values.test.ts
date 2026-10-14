import { test } from "node:test";
import assert from "node:assert/strict";
import type { ArchiveRow } from "@prisma/client";
import {
  buildFlexibleArchivePatch,
  effectiveChargeSnapshot,
  manualCellDisplayValue,
} from "src/modules/archive/archive-manual-cell-values";
import {
  buildSyncArchiveRowUpdate,
  serializeManualOverrides,
} from "src/modules/archive/archive-manual-overrides";
import type { ArchiveAutoFields } from "src/modules/archive/archive-sync.recompute";

function baseRow(overrides: Partial<ArchiveRow> = {}): ArchiveRow {
  const now = new Date();
  return {
    id: 1,
    vehicleId: 1,
    contractId: "c1",
    rowOrder: 1,
    kmIn: 100,
    km: 50,
    kmOut: 50,
    deliveryDate: null,
    deliveryTime: "10:00",
    returnDate: null,
    returnTime: null,
    customerName: "Staff",
    customerPhone: "050",
    description: null,
    days: 30,
    dailyRate: 100,
    rentalTotal: 700,
    salik: 50,
    parking: null,
    fuel: 200,
    blackPoints: 100,
    fines: 100,
    total: 450,
    dollar: null,
    cash: null,
    visa: null,
    transfer: null,
    remaining: null,
    manualOverrides: serializeManualOverrides({ days: true, fuel: true }),
    manualCellValues: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("A days manual text stores manualCellValues and override without changing typed days", () => {
  const existing = baseRow();
  const { data } = buildFlexibleArchivePatch(existing, { days: "شهري" });
  assert.equal(data.days, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(data.manualCellValues)), { days: "شهري" });
});

test("B fuel manual text uses 0 in charge snapshot", () => {
  const row = baseRow({
    fuel: 200,
    manualCellValues: { fuel: "شامل" },
    manualOverrides: serializeManualOverrides({ fuel: true }),
  });
  assert.equal(manualCellDisplayValue(row, "fuel"), "شامل");
  const snap = effectiveChargeSnapshot(row);
  assert.equal(snap.fuel, 0);
  assert.equal(snap.salik, 50);
});

test("C fuel numeric string updates typed fuel", () => {
  const existing = baseRow({ manualCellValues: { fuel: "شامل" } });
  const { data } = buildFlexibleArchivePatch(existing, { fuel: "150" });
  assert.equal(data.fuel, 150);
  assert.deepEqual(JSON.parse(JSON.stringify(data.manualCellValues)), {});
});

test("D deliveryDate manual text stored in manualCellValues", () => {
  const existing = baseRow();
  const { data } = buildFlexibleArchivePatch(existing, { deliveryDate: "لاحقاً" });
  assert.equal(data.deliveryDate, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(data.manualCellValues)), {
    deliveryDate: "لاحقاً",
  });
});

test("F sync keeps manual days text", () => {
  const existing = baseRow({
    days: 30,
    manualCellValues: { days: "شهري" },
    manualOverrides: serializeManualOverrides({ days: true }),
  });
  const auto: ArchiveAutoFields = {
    customerName: "Auto",
    customerPhone: "051",
    days: 99,
    dailyRate: 100,
    rentalTotal: 700,
    cash: null,
    visa: null,
    kmOut: 50,
    deliveryDate: null,
    deliveryTime: "10:00",
    kmIn: 100,
    returnDate: null,
    returnTime: null,
    km: 50,
    fuel: 200,
    salik: 50,
    blackPoints: 100,
    fines: 100,
    total: 450,
  };
  const update = buildSyncArchiveRowUpdate(existing, auto);
  assert.equal(update.days, 30);
  assert.equal(manualCellDisplayValue({ ...existing, ...update, manualCellValues: existing.manualCellValues }, "days"), "شهري");
});
