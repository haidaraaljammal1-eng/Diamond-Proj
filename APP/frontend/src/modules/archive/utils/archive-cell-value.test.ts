import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArchiveCellPatch, readArchiveCellDisplay } from "./archive-cell-value.ts";
import type { ArchiveRow } from "../types/archive.types.ts";

const baseRow: ArchiveRow = {
  id: 1,
  vehicleId: 2,
  rowOrder: 1,
  kmIn: null,
  km: 0,
  kmOut: null,
  deliveryDate: "2026-09-23T00:00:00.000Z",
  deliveryTime: null,
  returnDate: null,
  returnTime: null,
  customerName: null,
  customerPhone: "+9710501234567",
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("archive cell value", () => {
  it("renders zero as 0 not empty", () => {
    assert.equal(readArchiveCellDisplay(baseRow, "km"), "0");
  });

  it("preserves phone string", () => {
    assert.equal(readArchiveCellDisplay(baseRow, "customerPhone"), "+9710501234567");
  });

  it("parses cleared numeric field to null", () => {
    assert.equal(parseArchiveCellPatch("salik", ""), null);
  });

  it("rejects decimal money input", () => {
    assert.equal(parseArchiveCellPatch("cash", "1250.50"), "invalid");
  });

  it("parses sparse patch for one field only", () => {
    assert.equal(parseArchiveCellPatch("visa", "570"), 570);
  });
});
