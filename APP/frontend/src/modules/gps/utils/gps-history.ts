import type {
  GpsHistoryPreset,
  GpsHistoryRange,
  GpsPlaybackSpeed,
} from "../types/gps.types";

export const GPS_HISTORY_MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1_000;
export const GPS_HISTORY_UAE_OFFSET = "+04:00";
const UAE_OFFSET_MS = 4 * 60 * 60 * 1_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export type GpsHistoryRangeValidation =
  | { valid: true }
  | { valid: false; reason: "invalid" | "too_large" | "future_only" };

export function historyPresetRange(
  preset: Exclude<GpsHistoryPreset, "custom">,
  now = new Date(),
): GpsHistoryRange {
  const hours = preset === "last1h" ? 1 : preset === "last6h" ? 6 : 24;
  return {
    from: new Date(now.getTime() - hours * 60 * 60 * 1_000).toISOString(),
    to: now.toISOString(),
  };
}

export function customUaeHistoryRange(
  fromDate: string,
  fromTime: string,
  toDate: string,
  toTime: string,
): GpsHistoryRange | null {
  if (
    !ISO_DATE_RE.test(fromDate) ||
    !ISO_DATE_RE.test(toDate) ||
    !TIME_RE.test(fromTime) ||
    !TIME_RE.test(toTime)
  ) {
    return null;
  }
  const from = new Date(`${fromDate}T${fromTime}:00${GPS_HISTORY_UAE_OFFSET}`);
  const to = new Date(`${toDate}T${toTime}:00${GPS_HISTORY_UAE_OFFSET}`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

export function validateHistoryRange(
  range: GpsHistoryRange,
  now = new Date(),
): GpsHistoryRangeValidation {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return { valid: false, reason: "invalid" };
  }
  if (from > now.getTime() && to > now.getTime()) {
    return { valid: false, reason: "future_only" };
  }
  if (to - from > GPS_HISTORY_MAX_RANGE_MS) {
    return { valid: false, reason: "too_large" };
  }
  return { valid: true };
}

export function toUaeCalendarParts(instant: Date): { date: string; time: string } {
  const local = new Date(instant.getTime() + UAE_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

export function playbackDelayMs(speed: GpsPlaybackSpeed): number {
  return Math.max(75, Math.floor(800 / Number(speed)));
}

export function clampPlaybackIndex(index: number, pointCount: number): number {
  if (pointCount <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), pointCount - 1);
}

export function historyDisplayMotion(speedKph: number | null): "moving" | "stopped" {
  return speedKph != null && speedKph > 3 ? "moving" : "stopped";
}
