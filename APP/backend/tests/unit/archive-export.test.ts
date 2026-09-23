import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { ArchiveRow } from "@prisma/client";
import {
  ARCHIVE_EXPORT_COLUMN_COUNT,
  ARCHIVE_EXPORT_HEADERS,
  archiveExportFilename,
  formatArchiveVehicleHeader,
} from "src/modules/archive/archive-export.constants";
import {
  addArchiveVehicleWorksheet,
  assertNoFormulasInWorksheet,
} from "src/modules/archive/archive-excel";
import { buildArchiveSheetNames } from "src/modules/archive/archive-sheet-names";

const now = new Date("2026-01-15T10:00:00.000Z");

function makeRow(overrides: Partial<ArchiveRow> = {}): ArchiveRow {
  return {
    id: 1,
    vehicleId: 10,
    rowOrder: 1,
    kmIn: null,
    km: 0,
    kmOut: null,
    deliveryDate: new Date("2026-09-23T00:00:00.000Z"),
    deliveryTime: "09:30",
    returnDate: null,
    returnTime: null,
    customerName: "ARCHIVE-4 TEST",
    customerPhone: "0501234567",
    description: "Excel export verification",
    days: null,
    dailyRate: null,
    rentalTotal: null,
    salik: null,
    parking: null,
    fuel: null,
    blackPoints: null,
    fines: null,
    total: null,
    dollar: null,
    cash: null,
    visa: null,
    transfer: null,
    remaining: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("archiveExportFilename uses Diamond_Archive_YYYY-MM-DD.xlsx", () => {
  assert.equal(
    archiveExportFilename(new Date("2026-09-24T15:30:00.000Z")),
    "Diamond_Archive_2026-09-24.xlsx",
  );
});

test("formatArchiveVehicleHeader matches UI em dash format", () => {
  assert.equal(formatArchiveVehicleHeader("BMW X2", "P 61362"), "BMW X2 — P 61362");
});

test("buildArchiveSheetNames sanitizes invalid characters", () => {
  const names = buildArchiveSheetNames([
    { id: 1, displayName: "Bad/Name?*", plateNumber: "P1" },
  ]);
  assert.equal(names.get(1), "Bad Name");
  assert.ok((names.get(1) ?? "").length <= 31);
});

test("buildArchiveSheetNames truncates long names", () => {
  const longName = "A".repeat(40);
  const names = buildArchiveSheetNames([{ id: 1, displayName: longName, plateNumber: null }]);
  assert.equal(names.get(1)?.length, 31);
});

test("buildArchiveSheetNames distinguishes duplicate display names by plate", () => {
  const names = buildArchiveSheetNames([
    { id: 1, displayName: "Nissan Sunny", plateNumber: "P61362" },
    { id: 2, displayName: "Nissan Sunny", plateNumber: "P84521" },
  ]);
  assert.equal(names.get(1), "Nissan Sunny - P61362");
  assert.equal(names.get(2), "Nissan Sunny - P84521");
  assert.notEqual(names.get(1), names.get(2));
});

test("buildArchiveSheetNames uses deterministic suffix when sanitized names still collide", () => {
  const names = buildArchiveSheetNames([
    { id: 1, displayName: "Same", plateNumber: "P1" },
    { id: 2, displayName: "Same", plateNumber: "P1" },
  ]);
  assert.notEqual(names.get(1), names.get(2));
  assert.ok(names.get(1)?.includes("Same"));
  assert.ok(names.get(2)?.includes("Same"));
});

test("workbook sheet contains merged header, 24 headers, and persisted values", async () => {
  const wb = new ExcelJS.Workbook();
  const vehicle = { id: 10, displayName: "BMW X2", plateNumber: "P 61362" };
  const ws = addArchiveVehicleWorksheet(wb, "BMW X2", vehicle, [makeRow()]);

  assert.equal(ws.rowCount, 3);
  assert.equal(ws.getCell("A1").value, "BMW X2 — P 61362");
  assert.equal(ws.getCell("A1").isMerged, true);
  assert.equal(ws.model.merges?.includes("A1:X1"), true);
  assert.equal(ws.views?.[0]?.rightToLeft, true);

  assert.deepEqual(
    ARCHIVE_EXPORT_HEADERS.slice(0, 3),
    ["KM OUT", "KM IN", "KM"],
  );
  for (let index = 0; index < ARCHIVE_EXPORT_HEADERS.length; index += 1) {
    assert.equal(ws.getRow(2).getCell(index + 1).value, ARCHIVE_EXPORT_HEADERS[index]);
  }

  assert.equal(ws.getRow(3).getCell(1).value, null);
  assert.equal(ws.getRow(3).getCell(3).value, 0);
  assert.equal(ws.getRow(3).getCell(8).value, "ARCHIVE-4 TEST");
  assert.equal(ws.getRow(3).getCell(9).value, "0501234567");
  assert.equal(ws.getRow(3).getCell(9).numFmt, "@");
  assert.equal(ws.getRow(3).getCell(5).value, "09:30");
  const deliveryDate = ws.getRow(3).getCell(4).value;
  assert.ok(deliveryDate instanceof Date);
  assert.equal((deliveryDate as Date).getFullYear(), 2026);
  assert.equal((deliveryDate as Date).getMonth(), 8);
  assert.equal((deliveryDate as Date).getDate(), 23);

  assertNoFormulasInWorksheet(ws);
});

test("empty vehicle sheet still has header rows only", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = addArchiveVehicleWorksheet(
    wb,
    "Empty Vehicle",
    { id: 99, displayName: "Empty Vehicle", plateNumber: "P 000" },
    [],
  );
  assert.equal(ws.rowCount, 2);
  assert.equal(ws.views?.[0]?.rightToLeft, true);
  assert.equal(ws.getCell("A1").value, "Empty Vehicle — P 000");
  assert.equal(ARCHIVE_EXPORT_COLUMN_COUNT, 24);
});

test("null archive values export as blank cells", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = addArchiveVehicleWorksheet(
    wb,
    "Vehicle",
    { id: 1, displayName: "Vehicle", plateNumber: null },
    [makeRow({ km: null, customerPhone: null })],
  );
  assert.equal(ws.getRow(3).getCell(3).value, null);
  assert.equal(ws.getRow(3).getCell(9).value, null);
});
