import type ExcelJS from "exceljs";
import {
  ARCHIVE_EXPORT_COLUMN_COUNT,
  ARCHIVE_EXPORT_COLUMNS,
  ARCHIVE_EXPORT_HEADERS,
  ARCHIVE_IMPORT_HEADER_ALIASES,
  type ArchiveExportField,
} from "src/modules/archive/archive-export.constants";
import type { ArchiveImportCellError } from "src/modules/archive/archive-import.errors";
import { ARCHIVE_EDITABLE_FIELDS } from "src/modules/archive/archive-manual-cell-values.fields";
import { prismaDataFromImportFields } from "src/modules/archive/archive-manual-cell-values";
import type { ArchiveImportRowData } from "src/modules/archive/archive-import.types";

const VEHICLE_HEADER_SEPARATOR = " — ";
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export interface FleetVehicleForImportMatch {
  id: number;
  displayName: string;
  plateNumber: string | null;
}

export interface ParsedVehicleHeader {
  displayName: string;
  plateNumber: string | null;
}

export function normalizePlate(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return null;
  return compact.toUpperCase();
}

export function parseVehicleHeaderCell(raw: unknown): ParsedVehicleHeader | null {
  const text = cellToDisplayString(raw);
  if (!text) return null;
  const separatorIndex = text.indexOf(VEHICLE_HEADER_SEPARATOR);
  if (separatorIndex >= 0) {
    const displayName = text.slice(0, separatorIndex).trim();
    const plateNumber = text.slice(separatorIndex + VEHICLE_HEADER_SEPARATOR.length).trim();
    return {
      displayName: displayName || text,
      plateNumber: plateNumber || null,
    };
  }
  return { displayName: text.trim(), plateNumber: null };
}

export function exportHeaderAcceptedAtColumnIndex(index: number, actual: string): boolean {
  const column = ARCHIVE_EXPORT_COLUMNS[index];
  if (!column) return false;
  if (actual === column.header) return true;
  const aliases = ARCHIVE_IMPORT_HEADER_ALIASES[column.field as ArchiveExportField];
  return aliases?.includes(actual) ?? false;
}

export function headersMatchExport(row: ExcelJS.Row): boolean {
  for (let index = 0; index < ARCHIVE_EXPORT_HEADERS.length; index += 1) {
    const actual = cellToDisplayString(row.getCell(index + 1).value);
    if (!exportHeaderAcceptedAtColumnIndex(index, actual)) return false;
  }
  return true;
}

export function matchVehicleByHeader(
  header: ParsedVehicleHeader,
  fleet: FleetVehicleForImportMatch[],
): { kind: "matched"; vehicle: FleetVehicleForImportMatch } | { kind: "unmatched" } | { kind: "ambiguous" } {
  const plateKey = normalizePlate(header.plateNumber);
  if (plateKey) {
    const byPlate = fleet.filter((v) => normalizePlate(v.plateNumber) === plateKey);
    if (byPlate.length === 1) return { kind: "matched", vehicle: byPlate[0]! };
    if (byPlate.length > 1) return { kind: "ambiguous" };
    return { kind: "unmatched" };
  }

  const nameKey = header.displayName.trim().toLowerCase();
  const withoutPlate = fleet.filter((v) => !normalizePlate(v.plateNumber));
  const byName = withoutPlate.filter((v) => v.displayName.trim().toLowerCase() === nameKey);
  if (byName.length === 1) return { kind: "matched", vehicle: byName[0]! };
  if (byName.length > 1) return { kind: "ambiguous" };
  return { kind: "unmatched" };
}

function cellToDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) {
    if ("formula" in value) {
      const result = (value as { result?: unknown }).result;
      return cellToDisplayString(result);
    }
    if ("richText" in value) {
      const parts = (value as { richText: Array<{ text: string }> }).richText;
      return parts.map((p) => p.text).join("");
    }
    if ("text" in value && typeof (value as { text: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
  }
  return String(value).trim();
}

function readCellRaw(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value !== null && typeof value === "object" && value !== null && "formula" in value) {
    const formulaValue = value as ExcelJS.CellFormulaValue;
    if (formulaValue.result !== undefined && formulaValue.result !== null) {
      return formulaValue.result;
    }
    return undefined;
  }
  return value;
}

function calendarDateToApiDate(value: Date): string {
  const iso = value.toISOString();
  const match = ISO_DATE_PREFIX.exec(iso);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseFieldValue(
  kind: (typeof ARCHIVE_EXPORT_COLUMNS)[number]["kind"],
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  if (kind === "date") {
    if (raw instanceof Date) {
      return { ok: true, value: calendarDateToApiDate(raw) };
    }
    const text = cellToDisplayString(raw);
    if (!text) return { ok: true, value: null };
    if (!ISO_DATE_PREFIX.test(text)) {
      return { ok: true, value: text };
    }
    return { ok: true, value: text.slice(0, 10) };
  }

  if (kind === "time") {
    const text = cellToDisplayString(raw);
    if (!text) return { ok: true, value: null };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
      return { ok: true, value: text };
    }
    return { ok: true, value: text };
  }

  if (kind === "integer" || kind === "money") {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      if (!Number.isInteger(raw)) return { ok: true, value: cellToDisplayString(raw) };
      if (raw < 0) return { ok: false, reason: "Must be non-negative" };
      return { ok: true, value: raw };
    }
    const text = cellToDisplayString(raw);
    if (!text) return { ok: true, value: null };
    if (!/^\d+$/.test(text)) return { ok: true, value: text };
    const parsed = Number.parseInt(text, 10);
    return { ok: true, value: parsed };
  }

  if (kind === "phone" || kind === "text" || kind === "description") {
    const text = cellToDisplayString(raw);
    if (!text) return { ok: true, value: null };
    return { ok: true, value: text };
  }

  return { ok: false, reason: "Unsupported cell type" };
}

function rowIsEmpty(fields: Record<string, unknown>): boolean {
  return ARCHIVE_EXPORT_COLUMNS.every((column) => {
    const value = fields[column.field];
    return value === null || value === undefined;
  });
}

export function parseArchiveImportSheetRows(
  ws: ExcelJS.Worksheet,
  sheetName: string,
  vehiclePlate: string | null,
): { rows: ArchiveImportRowData[]; errors: ArchiveImportCellError[] } {
  const errors: ArchiveImportCellError[] = [];
  const rows: ArchiveImportRowData[] = [];
  const lastRow = ws.rowCount;

  for (let rowNumber = 3; rowNumber <= lastRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    const fields: Record<string, unknown> = {};
    let rowHasFormulaWithoutResult = false;

    for (let colIndex = 0; colIndex < ARCHIVE_EXPORT_COLUMNS.length; colIndex += 1) {
      const column = ARCHIVE_EXPORT_COLUMNS[colIndex]!;
      const cell = row.getCell(colIndex + 1);
      const rawValue = cell.value;
      if (
        rawValue !== null &&
        typeof rawValue === "object" &&
        rawValue !== null &&
        "formula" in rawValue &&
        (rawValue as ExcelJS.CellFormulaValue).result === undefined
      ) {
        rowHasFormulaWithoutResult = true;
        errors.push({
          sheetName,
          vehiclePlate,
          row: rowNumber,
          column: column.field,
          value: "",
          reason: "Formula cell has no computed value",
        });
        continue;
      }

      const raw = readCellRaw(cell);
      const parsed = parseFieldValue(column.kind, raw);
      if (!parsed.ok) {
        errors.push({
          sheetName,
          vehiclePlate,
          row: rowNumber,
          column: column.field,
          value: cellToDisplayString(raw),
          reason: parsed.reason,
        });
        continue;
      }
      fields[column.field] = parsed.value;
    }

    if (rowHasFormulaWithoutResult) continue;
    if (rowIsEmpty(fields)) continue;

    const importBody: Partial<Record<(typeof ARCHIVE_EDITABLE_FIELDS)[number], string | number | null>> =
      {};
    for (const field of ARCHIVE_EDITABLE_FIELDS) {
      const value = fields[field];
      if (value === undefined) continue;
      importBody[field] = value as string | number | null;
    }
    const resolved = prismaDataFromImportFields(importBody);
    rows.push(resolved as ArchiveImportRowData);
  }

  return { rows, errors };
}

export function assertSheetLayout(ws: ExcelJS.Worksheet): void {
  if (ws.rowCount < 2) {
    throw new Error("Sheet must contain at least header rows");
  }
  const headerRow = ws.getRow(2);
  if (!headersMatchExport(headerRow)) {
    throw new Error("Column headers do not match Diamond Archive export");
  }
  if (ARCHIVE_EXPORT_COLUMN_COUNT !== 24) {
    throw new Error("Unexpected archive column count");
  }
}
