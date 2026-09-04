/**
 * The ONE structured shape every report produces.
 *
 * A report is built exactly once (`report-runners.ts`) and that single result feeds
 * the JSON preview AND every export (XLSX / PDF). There is no second query
 * path and no renderer that re-derives a value, so preview and file can never
 * disagree (prompt §16).
 *
 * Cells carry TYPED values — real numbers, real Dates, fractions for percentages —
 * never pre-formatted strings. Each renderer applies its own presentation:
 *   XLSX  → numeric cell + number format (percent cells stay fractions)
 *   PDF   → text, localized, percent rendered as "42.4%"
 *   JSON  → raw value; the frontend formats using `column.type`
 *
 * Labels are authored in BOTH languages on the column/KPI definition itself, so an
 * Arabic export is a label lookup — never a translation table keyed by English text.
 */

export type ReportCellType =
  | "TEXT"
  | "INTEGER"
  | "DECIMAL"
  /** Stored as a FRACTION 0..1. */
  | "PERCENT"
  | "DATE"
  | "DATETIME";

export type ReportCell = string | number | boolean | Date | null;

export interface ReportColumn {
  key: string;
  labelEn: string;
  labelAr: string;
  type: ReportCellType;
  /** Preferred width in characters (XLSX column width, PDF weight). */
  width?: number;
}

export interface ReportTable {
  key: string;
  titleEn: string;
  titleAr: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
}

/** A single headline number. `value === null` means "no data" — never rendered as 0. */
export interface ReportKpi {
  key: string;
  labelEn: string;
  labelAr: string;
  type: ReportCellType;
  value: number | null;
}

export interface ReportPeriodInfo {
  from: Date;
  /** Exclusive. */
  to: Date;
  type: string;
}

export interface ReportResult {
  code: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  generatedAt: Date;
  period: ReportPeriodInfo;
  /** Resolved branch scope actually applied (never what was merely requested). */
  scope: { allBranches: boolean; branchIds: number[]; branchNames: string[] };
  filters: { periodType: string; branchIds: number[] | null };
  kpis: ReportKpi[];
  tables: ReportTable[];
  /** Total data rows across every table — the "عدد النتائج" the UI shows. */
  totalRows: number;
}

export const col = (
  key: string,
  labelEn: string,
  labelAr: string,
  type: ReportCellType,
  width?: number,
): ReportColumn => ({ key, labelEn, labelAr, type, ...(width ? { width } : {}) });

export const kpi = (
  key: string,
  labelEn: string,
  labelAr: string,
  type: ReportCellType,
  value: number | null,
): ReportKpi => ({ key, labelEn, labelAr, type, value });

export function countRows(tables: ReportTable[]): number {
  return tables.reduce((n, t) => n + t.rows.length, 0);
}
