import type { ArchiveRow } from "@prisma/client";
import type ExcelJS from "exceljs";
import {
  ARCHIVE_EXPORT_COLUMN_COUNT,
  ARCHIVE_EXPORT_COLUMNS,
  ARCHIVE_EXPORT_DATE_FORMAT,
  ARCHIVE_EXPORT_HEADERS,
  ARCHIVE_EXPORT_LAST_COLUMN_LETTER,
  formatArchiveVehicleHeader,
} from "src/modules/archive/archive-export.constants";
import type { ArchiveSheetVehicleInput } from "src/modules/archive/archive-sheet-names";

const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFE8E2D4" },
};

const VEHICLE_HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFD4C4A0" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB8AE9A" } },
  left: { style: "thin", color: { argb: "FFB8AE9A" } },
  bottom: { style: "thin", color: { argb: "FFB8AE9A" } },
  right: { style: "thin", color: { argb: "FFB8AE9A" } },
};

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function calendarDateFromDb(value: Date): Date {
  const iso = value.toISOString();
  const match = ISO_DATE_PREFIX.exec(iso);
  if (match) {
    const year = Number.parseInt(match[1]!, 10);
    const month = Number.parseInt(match[2]!, 10);
    const day = Number.parseInt(match[3]!, 10);
    return new Date(year, month - 1, day);
  }
  return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function readArchiveFieldValue(row: ArchiveRow, field: (typeof ARCHIVE_EXPORT_COLUMNS)[number]["field"]) {
  return row[field];
}

function writeArchiveCell(
  cell: ExcelJS.Cell,
  kind: (typeof ARCHIVE_EXPORT_COLUMNS)[number]["kind"],
  value: unknown,
): void {
  if (value === null || value === undefined) {
    cell.value = null;
    return;
  }

  if (kind === "integer" || kind === "money") {
    cell.value = typeof value === "number" ? value : null;
    return;
  }

  if (kind === "date") {
    cell.value = value instanceof Date ? calendarDateFromDb(value) : null;
    cell.numFmt = ARCHIVE_EXPORT_DATE_FORMAT;
    return;
  }

  if (kind === "time" || kind === "text" || kind === "description") {
    cell.value = String(value);
    return;
  }

  if (kind === "phone") {
    cell.value = String(value);
    cell.numFmt = "@";
  }
}

function applyBorders(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = THIN_BORDER;
  });
}

export function addArchiveVehicleWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  vehicle: ArchiveSheetVehicleInput,
  rows: ArchiveRow[],
): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 2, rightToLeft: true }],
  });

  ws.columns = ARCHIVE_EXPORT_COLUMNS.map((column) => ({
    key: column.field,
    width: column.width,
  }));

  ws.mergeCells(`A1:${ARCHIVE_EXPORT_LAST_COLUMN_LETTER}1`);
  const vehicleHeaderCell = ws.getCell("A1");
  vehicleHeaderCell.value = formatArchiveVehicleHeader(vehicle.displayName, vehicle.plateNumber);
  vehicleHeaderCell.font = { bold: true, size: 14 };
  vehicleHeaderCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  vehicleHeaderCell.fill = VEHICLE_HEADER_FILL;
  vehicleHeaderCell.border = THIN_BORDER;
  ws.getRow(1).height = 28;

  const headerRow = ws.getRow(2);
  ARCHIVE_EXPORT_HEADERS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = HEADER_FILL;
  });
  applyBorders(headerRow);
  headerRow.height = 22;

  let nextDataRow = 3;
  for (const archiveRow of rows) {
    const dataRow = ws.getRow(nextDataRow);
    nextDataRow += 1;
    ARCHIVE_EXPORT_COLUMNS.forEach((column, index) => {
      const cell = dataRow.getCell(index + 1);
      writeArchiveCell(cell, column.kind, readArchiveFieldValue(archiveRow, column.field));
      cell.alignment = {
        vertical: "middle",
        horizontal: column.alignment,
        wrapText: column.kind === "description",
      };
    });
    applyBorders(dataRow);
  }

  return ws;
}

export function assertNoFormulasInWorksheet(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value) {
        throw new Error(`Unexpected formula in archive export at ${cell.address}`);
      }
    });
  });
}

export { ARCHIVE_EXPORT_COLUMN_COUNT };
