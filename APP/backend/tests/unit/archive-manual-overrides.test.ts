import { test } from "node:test";
import assert from "node:assert/strict";
import type { ArchiveRow } from "@prisma/client";
import {
  applyPatchManualOverrides,
  buildSyncArchiveRowUpdate,
  isManualOverride,
  mergeImportManualOverrides,
  parseManualOverrides,
  serializeManualOverrides,
  shouldRecalculateTotalAfterPatch,
  totalAfterPatch,
} from "src/modules/archive/archive-manual-overrides";
import type { ArchiveAutoFields } from "src/modules/archive/archive-sync.recompute";

function baseRow(overrides: Partial<Record<string, boolean>> = {}): ArchiveRow {
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
    customerName: "Staff Name",
    customerPhone: "050",
    description: null,
    days: 7,
    dailyRate: 100,
    rentalTotal: 700,
    salik: 50,
    parking: null,
    fuel: 150,
    blackPoints: 300,
    fines: 100,
    total: 600,
    dollar: null,
    cash: 700,
    visa: null,
    transfer: null,
    remaining: null,
    manualOverrides: serializeManualOverrides(overrides),
    manualCellValues: {},
    createdAt: now,
    updatedAt: now,
  };
}

function baseAuto(overrides: Partial<ArchiveAutoFields> = {}): ArchiveAutoFields {
  return {
    customerName: "Auto Customer",
    customerPhone: "051",
    days: 7,
    dailyRate: 100,
    rentalTotal: 700,
    cash: 700,
    visa: null,
    kmOut: 60,
    deliveryDate: null,
    deliveryTime: "11:00",
    kmIn: 120,
    returnDate: null,
    returnTime: null,
    km: 60,
    fuel: 200,
    salik: 80,
    blackPoints: 500,
    fines: 100,
    total: 880,
    ...overrides,
  };
}

test("A fuel manual override survives sync", () => {
  const existing = baseRow({ fuel: true });
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ fuel: 300 }));
  assert.equal(update.fuel, 150);
});

test("B salik manual null survives sync", () => {
  const existing = baseRow({ salik: true });
  existing.salik = null;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ salik: 80 }));
  assert.equal(update.salik, null);
});

test("C damage and fines manual survive sync", () => {
  const existing = baseRow({ blackPoints: true, fines: true });
  existing.blackPoints = 350;
  existing.fines = 90;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto());
  assert.equal(update.blackPoints, 350);
  assert.equal(update.fines, 90);
});

test("D kmOut manual survives sync", () => {
  const existing = baseRow({ kmOut: true });
  existing.kmOut = 55;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ kmOut: 60 }));
  assert.equal(update.kmOut, 55);
});

test("E customer manual survives sync", () => {
  const existing = baseRow({ customerName: true });
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ customerName: "Auto Customer" }));
  assert.equal(update.customerName, "Staff Name");
});

test("F days manual survives sync", () => {
  const existing = baseRow({ days: true });
  existing.days = 5;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ days: 7 }));
  assert.equal(update.days, 5);
});

test("G cash manual survives sync", () => {
  const existing = baseRow({ cash: true });
  existing.cash = 500;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ cash: 700 }));
  assert.equal(update.cash, 500);
});

test("H rentalTotal manual does not change extras total", () => {
  const existing = baseRow({ rentalTotal: true });
  existing.rentalTotal = 800;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto({ rentalTotal: 700 }));
  assert.equal(update.rentalTotal, 800);
  assert.equal(update.total, 200 + 80 + 0 + 500 + 100);
});

test("I component fuel patch recalculates total", () => {
  const existing = baseRow();
  const overrides = applyPatchManualOverrides(existing, { fuel: 120 });
  assert.ok(isManualOverride(overrides, "fuel"));
  assert.equal(
    shouldRecalculateTotalAfterPatch(overrides, { fuel: 120 }),
    true,
  );
  const total = totalAfterPatch(existing, { fuel: 120 });
  assert.equal(total, 120 + 50 + 0 + 300 + 100);
});

test("J total manual override blocks sync recompute", () => {
  const existing = baseRow({ total: true });
  existing.total = 9999;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto());
  assert.equal(update.total, 9999);
});

test("K import diff sets override for changed sync field", () => {
  const prev = baseRow({ fuel: true });
  const imported = {
    kmOut: prev.kmOut,
    kmIn: prev.kmIn,
    km: prev.km,
    deliveryDate: prev.deliveryDate,
    deliveryTime: prev.deliveryTime,
    returnDate: prev.returnDate,
    returnTime: prev.returnTime,
    customerName: prev.customerName,
    customerPhone: prev.customerPhone,
    days: prev.days,
    dailyRate: prev.dailyRate,
    rentalTotal: prev.rentalTotal,
    fuel: prev.fuel,
    salik: 99,
    blackPoints: prev.blackPoints,
    fines: prev.fines,
    total: prev.total,
    cash: prev.cash,
    visa: prev.visa,
    transfer: prev.transfer,
    remaining: prev.remaining,
  };
  const merged = mergeImportManualOverrides("c1", prev, imported, { fuel: true });
  assert.equal(merged.fuel, true);
  assert.equal(merged.salik, true);
});

test("D transfer manual is not written by sync payload", () => {
  const existing = baseRow();
  existing.transfer = 100;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto());
  assert.equal(Object.prototype.hasOwnProperty.call(update, "transfer"), false);
});

test("E remaining manual is not written by sync payload", () => {
  const existing = baseRow();
  existing.remaining = 50;
  const update = buildSyncArchiveRowUpdate(existing, baseAuto());
  assert.equal(Object.prototype.hasOwnProperty.call(update, "remaining"), false);
});

test("L import unchanged keeps meta overrides", () => {
  const prev = baseRow({ fuel: true });
  const imported = {
    kmOut: prev.kmOut,
    kmIn: prev.kmIn,
    km: prev.km,
    deliveryDate: prev.deliveryDate,
    deliveryTime: prev.deliveryTime,
    returnDate: prev.returnDate,
    returnTime: prev.returnTime,
    customerName: prev.customerName,
    customerPhone: prev.customerPhone,
    days: prev.days,
    dailyRate: prev.dailyRate,
    rentalTotal: prev.rentalTotal,
    fuel: prev.fuel,
    salik: prev.salik,
    blackPoints: prev.blackPoints,
    fines: prev.fines,
    total: prev.total,
    cash: prev.cash,
    visa: prev.visa,
    transfer: prev.transfer,
    remaining: prev.remaining,
  };
  const merged = mergeImportManualOverrides("c1", prev, imported, { fuel: true });
  assert.deepEqual(parseManualOverrides(serializeManualOverrides(merged)), { fuel: true });
});
