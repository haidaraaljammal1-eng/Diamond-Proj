import type { ReportCell, ReportCellType } from "src/modules/reports/report-model";

/**
 * ONE presentation layer for report cells, used by the PDF renderer (XLSX keeps native
 * types and applies a number format instead). Values are never re-derived here — this
 * only turns a typed value into text.
 *
 * Dates are rendered in the BUSINESS timezone (fixed offset, Asia/Riyadh = +180) so a
 * file matches the period boundaries the report was computed with. Digits stay Latin:
 * Arabic-Indic digits are not parsed back by Excel and break numeric sorting.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local (business-tz) date parts of a UTC instant. */
function shift(d: Date, offsetMinutes: number): Date {
  return new Date(d.getTime() + offsetMinutes * 60_000);
}

export function formatDate(d: Date, offsetMinutes: number): string {
  const l = shift(d, offsetMinutes);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`;
}

export function formatDateTime(d: Date, offsetMinutes: number): string {
  const l = shift(d, offsetMinutes);
  return `${formatDate(d, offsetMinutes)} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
}

/** Fraction 0..1 → "42.4%". Percent cells are stored as fractions everywhere. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/** The placeholder for "no data". NEVER 0 — the two mean different things. */
export const EMPTY_CELL = "—";

export function formatCell(cell: ReportCell, type: ReportCellType, offsetMinutes: number): string {
  if (cell == null) return EMPTY_CELL;
  if (cell instanceof Date) return type === "DATE" ? formatDate(cell, offsetMinutes) : formatDateTime(cell, offsetMinutes);
  if (typeof cell === "boolean") return cell ? "1" : "0";
  if (typeof cell === "number") {
    if (type === "PERCENT") return formatPercent(cell);
    if (type === "INTEGER") return String(Math.round(cell));
    return String(cell);
  }
  return String(cell);
}

/** Excel number format per column type (percent cells stay fractions + get a % format). */
export function excelNumberFormat(type: ReportCellType): string | undefined {
  switch (type) {
    case "INTEGER": return "#,##0";
    case "DECIMAL": return "#,##0.00";
    case "PERCENT": return "0.0%";
    case "DATE": return "yyyy-mm-dd";
    case "DATETIME": return "yyyy-mm-dd hh:mm";
    default: return undefined;
  }
}

/** Column types whose cells align to the numeric side. */
export function isNumericColumn(type: ReportCellType): boolean {
  return type === "INTEGER" || type === "DECIMAL" || type === "PERCENT";
}

/**
 * CSV formula-injection guard. The report catalog exports Excel + PDF only; these two
 * helpers stay because the AUDIT LOG still has a CSV export and must not ship an
 * executable cell.
 *
 * A cell whose text starts with `=`, `+`, `-`, `@`, TAB or CR can be executed as a
 * formula by Excel/Sheets, so it is prefixed with an apostrophe, which Excel reads as
 * "force text". Applied to the TEXT form only — real numbers are written as numbers
 * and are never a formula.
 */
export function csvSafe(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** RFC 4180 quoting. */
export function csvQuote(text: string): string {
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Slugify a (possibly Arabic) report name into a safe, readable file name. */
export function fileNameSlug(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/** Period suffix for a file name: 2026-07 · 2026-Q3 · 2026 · 2026-07-01_2026-07-15. */
export function periodFileSuffix(type: string, from: Date, to: Date, offsetMinutes: number): string {
  const l = shift(from, offsetMinutes);
  const year = l.getUTCFullYear();
  if (type === "MONTH") return `${year}-${pad(l.getUTCMonth() + 1)}`;
  if (type === "QUARTER") return `${year}-Q${Math.floor(l.getUTCMonth() / 3) + 1}`;
  if (type === "YEAR") return String(year);
  return `${formatDate(from, offsetMinutes)}_${formatDate(new Date(to.getTime() - 86_400_000), offsetMinutes)}`;
}

/** Excel sheet names cannot contain []:*?/\ and are capped at 31 characters. */
export function sheetName(title: string, fallback: string): string {
  const cleaned = title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned.length > 0 ? cleaned : fallback;
}
