/**
 * Reporting period boundaries. Timestamps are stored UTC; reporting boundaries
 * are computed in the configured BUSINESS timezone as a FIXED offset from UTC
 * (Asia/Riyadh is UTC+3 with NO DST, so a fixed offset is exact). `to` is
 * EXCLUSIVE (start of the next period). The previous comparable period is:
 *   MONTH → prior month · QUARTER → prior quarter · YEAR → prior year ·
 *   CUSTOM → the equally-long window immediately before `from`.
 */
export type PeriodType = "MONTH" | "QUARTER" | "YEAR" | "CUSTOM";

export interface Period {
  from: Date;
  to: Date; // exclusive
}
export interface ResolvedPeriod {
  type: PeriodType;
  current: Period;
  previous: Period;
  offsetMinutes: number;
}

/** UTC instant for a local wall-clock midnight (business offset applied). */
function utcFromLocalMidnight(y: number, mZeroBased: number, d: number, offsetMinutes: number): Date {
  return new Date(Date.UTC(y, mZeroBased, d) - offsetMinutes * 60_000);
}

/** Local (business-tz) Y/M/D of a UTC instant. */
function localYmd(utc: Date, offsetMinutes: number): { y: number; m: number; d: number } {
  const shifted = new Date(utc.getTime() + offsetMinutes * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/**
 * The BUSINESS-timezone calendar day containing `now`, as UTC instants (`to`
 * exclusive). Used by "today" counters so a day starts at Riyadh midnight, not
 * UTC midnight — never by adding a fixed 3h to a UTC boundary.
 */
export function resolveBusinessDay(now: Date, offsetMinutes: number): Period {
  const { y, m, d } = localYmd(now, offsetMinutes);
  return {
    from: utcFromLocalMidnight(y, m, d, offsetMinutes),
    to: utcFromLocalMidnight(y, m, d + 1, offsetMinutes), // Date.UTC rolls month/year over
  };
}

export function resolvePeriod(type: PeriodType, now: Date, offsetMinutes: number, customFrom?: Date, customTo?: Date): ResolvedPeriod {
  const { y, m } = localYmd(now, offsetMinutes);
  if (type === "MONTH") {
    const curFrom = utcFromLocalMidnight(y, m, 1, offsetMinutes);
    const curTo = utcFromLocalMidnight(m === 11 ? y + 1 : y, (m + 1) % 12, 1, offsetMinutes);
    const prevFrom = utcFromLocalMidnight(m === 0 ? y - 1 : y, (m + 11) % 12, 1, offsetMinutes);
    return { type, offsetMinutes, current: { from: curFrom, to: curTo }, previous: { from: prevFrom, to: curFrom } };
  }
  if (type === "QUARTER") {
    const q = Math.floor(m / 3); // 0..3
    const qStartMonth = q * 3;
    const curFrom = utcFromLocalMidnight(y, qStartMonth, 1, offsetMinutes);
    const curTo = utcFromLocalMidnight(q === 3 ? y + 1 : y, (qStartMonth + 3) % 12, 1, offsetMinutes);
    const prevFrom = utcFromLocalMidnight(q === 0 ? y - 1 : y, q === 0 ? 9 : qStartMonth - 3, 1, offsetMinutes);
    return { type, offsetMinutes, current: { from: curFrom, to: curTo }, previous: { from: prevFrom, to: curFrom } };
  }
  if (type === "YEAR") {
    const curFrom = utcFromLocalMidnight(y, 0, 1, offsetMinutes);
    const curTo = utcFromLocalMidnight(y + 1, 0, 1, offsetMinutes);
    const prevFrom = utcFromLocalMidnight(y - 1, 0, 1, offsetMinutes);
    return { type, offsetMinutes, current: { from: curFrom, to: curTo }, previous: { from: prevFrom, to: curFrom } };
  }
  // CUSTOM
  const from = customFrom!;
  const to = customTo!;
  const length = to.getTime() - from.getTime();
  return { type, offsetMinutes, current: { from, to }, previous: { from: new Date(from.getTime() - length), to: from } };
}
