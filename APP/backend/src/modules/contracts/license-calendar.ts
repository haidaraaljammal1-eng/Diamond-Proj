/**
 * License expiry is a calendar DATE. Stored at UTC noon so a business-timezone
 * offset cannot roll the day. Comparison uses Y-M-D in the business timezone.
 */

export interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

/** Persist as UTC noon of the calendar day. */
export function calendarDateToStoredUtc(date: CalendarDate): Date {
  return new Date(Date.UTC(date.y, date.m - 1, date.d, 12, 0, 0));
}

export function storedUtcToCalendarDate(value: Date): CalendarDate {
  return {
    y: value.getUTCFullYear(),
    m: value.getUTCMonth() + 1,
    d: value.getUTCDate(),
  };
}

export function formatCalendarDate(date: CalendarDate): string {
  const m = String(date.m).padStart(2, "0");
  const d = String(date.d).padStart(2, "0");
  return `${date.y}-${m}-${d}`;
}

export function businessToday(now: Date, offsetMinutes: number): CalendarDate {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

export function compareCalendarDate(a: CalendarDate, b: CalendarDate): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

export function isLicenseExpiredOn(
  expiry: CalendarDate,
  today: CalendarDate,
): boolean {
  return compareCalendarDate(expiry, today) < 0;
}
