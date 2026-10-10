const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/;

export function isValidTimezoneOffset(offset: string): boolean {
  return OFFSET_RE.test(offset.trim());
}

function offsetToMinutes(offset: string): number {
  const m = OFFSET_RE.exec(offset.trim());
  if (!m) throw new Error("INVALID_OFFSET");
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(m[2]!, 10);
  const mins = Number.parseInt(m[3]!, 10);
  return sign * (hours * 60 + mins);
}

/** Format a UTC instant as the provider-local minute expected by history reads. */
export function formatLiveGpsLocalDateTime(date: Date, offset: string): string | null {
  if (!Number.isFinite(date.getTime()) || !isValidTimezoneOffset(offset)) return null;
  const local = new Date(date.getTime() + offsetToMinutes(offset) * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    local.getUTCFullYear(),
    "-",
    pad(local.getUTCMonth() + 1),
    "-",
    pad(local.getUTCDate()),
    " ",
    pad(local.getUTCHours()),
    ":",
    pad(local.getUTCMinutes()),
  ].join("");
}

/** Parse local datetime without zone using explicit offset → UTC Date. */
export function parseLiveGpsLocalDateTime(isoLocal: string, offset: string): Date | null {
  const trimmed = isoLocal.trim();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match || !isValidTimezoneOffset(offset)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const ms = match[7] ? Number(match[7].padEnd(3, "0").slice(0, 3)) : 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offsetMinutes = offsetToMinutes(offset);
  return new Date(utcMs - offsetMinutes * 60_000);
}

/**
 * Display form: 08-Oct-2026 08:20:46 PM (24h hour with PM — provider quirk).
 * Interpret hour as 24h when > 12 even if AM/PM present.
 */
export function parseLiveGpsDisplayDateTime(text: string, offset: string): Date | null {
  const trimmed = text.trim();
  const match =
    /^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (!match || !isValidTimezoneOffset(offset)) return null;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const mon = months[match[2]!.toLowerCase()];
  if (mon === undefined) return null;
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const ampm = match[7]!.toUpperCase();
  if (hour <= 12 && ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const year = Number(match[3]);
  const day = Number(match[1]);
  const utcMs = Date.UTC(year, mon, day, hour, minute, second, 0);
  const offsetMinutes = offsetToMinutes(offset);
  return new Date(utcMs - offsetMinutes * 60_000);
}

export function parseLiveGpsReportDateTime(
  date: string,
  time: string,
  offset: string,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!dateMatch || !timeMatch || !isValidTimezoneOffset(offset)) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const calendar = new Date(utcMs);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second
  ) {
    return null;
  }
  return new Date(utcMs - offsetToMinutes(offset) * 60_000);
}

/** Prefer fleet `lastdata` (ISO-like) over display `deviceLastData`. */
export function parseLiveGpsLastData(
  lastdata: string | null | undefined,
  deviceLastData: string | null | undefined,
  offset: string,
): Date | null {
  if (lastdata?.trim()) {
    const iso = parseLiveGpsLocalDateTime(lastdata.trim(), offset);
    if (iso) return iso;
  }
  if (deviceLastData?.trim()) {
    return parseLiveGpsDisplayDateTime(deviceLastData.trim(), offset);
  }
  return null;
}

export function timezoneOffsetFromAccountConfig(
  config: Record<string, unknown> | null | undefined,
): string | null {
  const raw = config?.timezoneOffset ?? config?.utimeZone;
  if (typeof raw !== "string" || !isValidTimezoneOffset(raw)) return null;
  return raw.trim();
}

/** Resolves the provider-local offset without ever consulting the host timezone. */
export function resolveLiveGpsTimezoneOffset(
  config: Record<string, unknown> | null | undefined,
  observedOffset?: string | null,
): string {
  return (
    timezoneOffsetFromAccountConfig(config) ??
    (observedOffset && isValidTimezoneOffset(observedOffset) ? observedOffset.trim() : null) ??
    "+04:00"
  );
}
