import type { FinancePeriodPreset, FinancePeriodRange } from "../types/finance.types";

function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

export function resolveFinancePeriodRange(
  preset: FinancePeriodPreset,
  customFrom?: string,
  customTo?: string,
): FinancePeriodRange {
  const now = new Date();

  if (preset === "custom" && customFrom && customTo) {
    const from = startOfDay(parseCalendarDate(customFrom));
    const to = addDays(startOfDay(parseCalendarDate(customTo)), 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const to = addDays(startOfDay(now), 1);
  let from = startOfDay(now);

  if (preset === "week") {
    from = addDays(startOfDay(now), -6);
  } else if (preset === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}
