const DAY_MS = 86_400_000;

/** Localized weekday + calendar day, e.g. `Fri 05`. ISO dates are UTC noon. */
export function formatDashboardChartDay(isoDate: string, locale: string): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  return `${weekday} ${isoDate.slice(8, 10)}`;
}

export function areConsecutiveIsoDates(dates: readonly string[]): boolean {
  if (dates.length <= 1) return true;
  for (let i = 1; i < dates.length; i++) {
    const prev = Date.parse(`${dates[i - 1]}T12:00:00.000Z`);
    const curr = Date.parse(`${dates[i]}T12:00:00.000Z`);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || curr - prev !== DAY_MS) {
      return false;
    }
  }
  return true;
}

export function isoDateIsWeekend(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}
