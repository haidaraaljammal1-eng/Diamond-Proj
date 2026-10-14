import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { addArchiveVehicleWorksheet } from "src/modules/archive/archive-excel";
import { ARCHIVE_EXPORT_HEADERS } from "src/modules/archive/archive-export.constants";
import {
  exportHeaderAcceptedAtColumnIndex,
  headersMatchExport,
  matchVehicleByHeader,
  normalizePlate,
  parseVehicleHeaderCell,
} from "src/modules/archive/archive-import.parse";
import type { ArchiveRow } from "@prisma/client";

const fleet = [
  { id: 1, displayName: "BMW X2", plateNumber: "P 61362" },
  { id: 2, displayName: "Nissan Sunny", plateNumber: "P84521" },
];

test("parseVehicleHeaderCell reads Diamond export em dash format", () => {
  const parsed = parseVehicleHeaderCell("BMW X2 — P 61362");
  assert.deepEqual(parsed, { displayName: "BMW X2", plateNumber: "P 61362" });
});

test("normalizePlate is case-insensitive and trims spaces", () => {
  assert.equal(normalizePlate(" p 61362 "), "P 61362");
});

test("matchVehicleByHeader matches by plate", () => {
  const match = matchVehicleByHeader(
    { displayName: "Any", plateNumber: "P 61362" },
    fleet,
  );
  assert.equal(match.kind, "matched");
  if (match.kind === "matched") assert.equal(match.vehicle.id, 1);
});

test("matchVehicleByHeader returns unmatched for unknown plate", () => {
  const match = matchVehicleByHeader(
    { displayName: "Ghost", plateNumber: "UNKNOWN" },
    fleet,
  );
  assert.equal(match.kind, "unmatched");
});

test("exported worksheet headers are accepted by import parser", async () => {
  const wb = new ExcelJS.Workbook();
  const now = new Date("2026-01-15T10:00:00.000Z");
  const row: ArchiveRow = {
    id: 1,
    vehicleId: 1,
    rowOrder: 1,
    kmIn: null,
    km: 100,
    kmOut: null,
    deliveryDate: null,
    deliveryTime: null,
    returnDate: null,
    returnTime: null,
    customerName: "Client",
    customerPhone: "050",
    description: null,
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
    contractId: null,
    manualOverrides: {},
    manualCellValues: {},
    createdAt: now,
    updatedAt: now,
  };
  addArchiveVehicleWorksheet(
    wb,
    "BMW",
    { id: 1, displayName: "BMW X2", plateNumber: "P 61362" },
    [row],
  );
  const ws = wb.worksheets[0]!;
  assert.equal(headersMatchExport(ws.getRow(2)), true);
});

test("import accepts legacy and English damage column headers", () => {
  assert.equal(exportHeaderAcceptedAtColumnIndex(16, "أضرار"), true);
  assert.equal(exportHeaderAcceptedAtColumnIndex(16, "نقاط سوداء"), true);
  assert.equal(exportHeaderAcceptedAtColumnIndex(16, "Damage"), true);
  assert.equal(exportHeaderAcceptedAtColumnIndex(16, "wrong"), false);
  assert.equal(ARCHIVE_EXPORT_HEADERS[16], "أضرار");
});
