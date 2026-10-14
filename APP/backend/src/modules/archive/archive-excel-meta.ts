import type ExcelJS from "exceljs";
import { ARCHIVE_EXCEL_META_SHEET_NAME } from "src/modules/archive/archive-sync.constants";
import {
  type ArchiveManualCellValues,
  parseManualCellValues,
  serializeManualCellValues,
} from "src/modules/archive/archive-manual-cell-values";
import {
  type ArchiveManualOverrides,
  parseManualOverrides,
  serializeManualOverrides,
} from "src/modules/archive/archive-manual-overrides";

const META_HEADERS = [
  "vehicleId",
  "rowOrder",
  "contractId",
  "manualOverrides",
  "manualCellValues",
] as const;

export type ArchiveExcelMetaRow = {
  vehicleId: number;
  rowOrder: number;
  contractId: string;
  manualOverrides?: ArchiveManualOverrides;
  manualCellValues?: ArchiveManualCellValues;
};

export function archiveExcelMetaKey(vehicleId: number, rowOrder: number): string {
  return `${vehicleId}:${rowOrder}`;
}

export function appendArchiveExcelMetaSheet(
  workbook: ExcelJS.Workbook,
  rows: ArchiveExcelMetaRow[],
): void {
  const sheet = workbook.addWorksheet(ARCHIVE_EXCEL_META_SHEET_NAME, {
    state: "veryHidden",
  });
  sheet.addRow([...META_HEADERS]);
  for (const row of rows) {
    const overridesJson = JSON.stringify(
      serializeManualOverrides(parseManualOverrides(row.manualOverrides ?? {})),
    );
    const manualValuesJson = JSON.stringify(
      serializeManualCellValues(parseManualCellValues(row.manualCellValues ?? {})),
    );
    sheet.addRow([row.vehicleId, row.rowOrder, row.contractId, overridesJson, manualValuesJson]);
  }
}

export type ArchiveExcelMetaEntry = {
  contractId: string;
  manualOverrides: ArchiveManualOverrides;
  manualCellValues: ArchiveManualCellValues;
};

export function parseArchiveExcelMetaSheet(
  workbook: ExcelJS.Workbook,
): Map<string, ArchiveExcelMetaEntry> {
  const sheet = workbook.getWorksheet(ARCHIVE_EXCEL_META_SHEET_NAME);
  const map = new Map<string, ArchiveExcelMetaEntry>();
  if (!sheet) return map;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vehicleId = Number(row.getCell(1).value);
    const rowOrder = Number(row.getCell(2).value);
    const contractId = String(row.getCell(3).value ?? "").trim();
    if (!Number.isFinite(vehicleId) || !Number.isFinite(rowOrder) || !contractId) return;

    const rawOverrides = row.getCell(4).value;
    let manualOverrides: ArchiveManualOverrides = {};
    if (typeof rawOverrides === "string" && rawOverrides.trim()) {
      try {
        manualOverrides = parseManualOverrides(JSON.parse(rawOverrides));
      } catch {
        manualOverrides = {};
      }
    }

    const rawManualValues = row.getCell(5).value;
    let manualCellValues: ArchiveManualCellValues = {};
    if (typeof rawManualValues === "string" && rawManualValues.trim()) {
      try {
        manualCellValues = parseManualCellValues(JSON.parse(rawManualValues));
      } catch {
        manualCellValues = {};
      }
    }

    map.set(archiveExcelMetaKey(vehicleId, rowOrder), {
      contractId,
      manualOverrides,
      manualCellValues,
    });
  });
  return map;
}

/** @deprecated Use parseArchiveExcelMetaSheet — kept for contractId-only lookups in older tests. */
export function parseArchiveExcelContractIds(
  workbook: ExcelJS.Workbook,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, entry] of parseArchiveExcelMetaSheet(workbook)) {
    map.set(key, entry.contractId);
  }
  return map;
}
