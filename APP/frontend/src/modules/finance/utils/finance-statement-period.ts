import type { FinancePeriodPreset } from "../types/finance.types";
import type { FinanceStatementExportParams, StatementPeriodType } from "../types/finance.types";

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

/** Maps Finance page period controls to statement export query defaults. */
export function buildStatementPrefillFromFinancePeriod(
  preset: FinancePeriodPreset,
  customFrom: string,
  customTo: string,
  now: Date = new Date(),
): FinanceStatementExportParams {
  if (preset === "custom" && customFrom && customTo) {
    return { periodType: "CUSTOM", from: customFrom, to: customTo };
  }
  if (preset === "today") {
    return { periodType: "TODAY" };
  }
  if (preset === "week") {
    const weekStart = formatYmd(addDays(startOfDay(now), -6));
    return { periodType: "WEEKLY", weekStart };
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    periodType: "MONTHLY",
    year: monthStart.getFullYear(),
    month: monthStart.getMonth() + 1,
  };
}

export const STATEMENT_PERIOD_TYPES: StatementPeriodType[] = [
  "TODAY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
];

/** Default when opening the statement export dialog. */
export const STATEMENT_EXPORT_DEFAULT: FinanceStatementExportParams = { periodType: "TODAY" };
