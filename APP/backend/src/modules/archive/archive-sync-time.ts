import { calendarDateToStoredUtc, parseCalendarDate, storedUtcToCalendarDate } from "src/modules/contracts/license-calendar";

/** Wall-clock date/time in business offset (env `BUSINESS_TIMEZONE_OFFSET_MINUTES`, default UTC+4). */
export function businessWallClockFromUtc(
  value: Date,
  offsetMinutes: number,
): { dateYmd: string; timeHm: string } {
  const shifted = new Date(value.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  return { dateYmd: `${y}-${m}-${d}`, timeHm: `${h}:${min}` };
}

export function businessDateToDbDate(dateYmd: string): Date | null {
  const parsed = parseCalendarDate(dateYmd);
  if (!parsed) return null;
  return calendarDateToStoredUtc(parsed);
}

export function dbDateToBusinessYmd(value: Date): string {
  const cal = storedUtcToCalendarDate(value);
  const m = String(cal.m).padStart(2, "0");
  const d = String(cal.d).padStart(2, "0");
  return `${cal.y}-${m}-${d}`;
}
