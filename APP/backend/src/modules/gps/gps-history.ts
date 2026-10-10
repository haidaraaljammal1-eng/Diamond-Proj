import {
  gpsHistoryInvalidRangeError,
  gpsHistoryRangeTooLargeError,
  gpsProviderInvalidResponseError,
} from "src/modules/gps/gps.errors";
import type { ProviderNormalizedHistoryPoint } from "src/modules/gps/gps-provider.types";

export const GPS_HISTORY_DEFAULT_RANGE_MS = 24 * 60 * 60 * 1_000;
export const GPS_HISTORY_MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1_000;
export const GPS_HISTORY_MAX_POINTS = 10_000;

const ISO_TIMESTAMP_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

export type GpsHistoryRangeQuery = {
  from?: string;
  to?: string;
};

export type ResolvedGpsHistoryRange = {
  from: Date;
  to: Date;
};

function parseIsoTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  const match = ISO_TIMESTAMP_WITH_ZONE.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

export function resolveGpsHistoryRange(
  query: GpsHistoryRangeQuery,
  now: Date,
): ResolvedGpsHistoryRange {
  if (!Number.isFinite(now.getTime())) throw gpsHistoryInvalidRangeError();

  const fromRaw = query.from?.trim();
  const toRaw = query.to?.trim();
  if (!fromRaw && !toRaw) {
    return {
      from: new Date(now.getTime() - GPS_HISTORY_DEFAULT_RANGE_MS),
      to: new Date(now),
    };
  }
  if (!fromRaw || !toRaw) throw gpsHistoryInvalidRangeError();

  const from = parseIsoTimestamp(fromRaw);
  const to = parseIsoTimestamp(toRaw);
  if (!from || !to || to.getTime() <= from.getTime()) {
    throw gpsHistoryInvalidRangeError();
  }
  if (from.getTime() > now.getTime() && to.getTime() > now.getTime()) {
    throw gpsHistoryInvalidRangeError();
  }
  if (to.getTime() - from.getTime() > GPS_HISTORY_MAX_RANGE_MS) {
    throw gpsHistoryRangeTooLargeError();
  }
  return { from, to };
}

function validHistoryPoint(point: ProviderNormalizedHistoryPoint): boolean {
  if (!Number.isFinite(point.capturedAt.getTime())) return false;
  if (
    !Number.isFinite(point.latitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    !Number.isFinite(point.longitude) ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    return false;
  }
  if (point.speedKph != null && (!Number.isFinite(point.speedKph) || point.speedKph < 0)) {
    return false;
  }
  if (
    point.segmentDistanceMeters != null &&
    (!Number.isFinite(point.segmentDistanceMeters) || point.segmentDistanceMeters < 0)
  ) {
    return false;
  }
  return true;
}

export function normalizeAndSummarizeHistory(points: ProviderNormalizedHistoryPoint[]) {
  if (!points.every(validHistoryPoint)) throw gpsProviderInvalidResponseError();

  const ordered = [...points].sort(
    (left, right) => left.capturedAt.getTime() - right.capturedAt.getTime(),
  );
  let totalDistanceMeters = 0;
  let maxSpeedKph: number | null = null;
  for (const point of ordered) {
    if (point.segmentDistanceMeters != null) {
      totalDistanceMeters += point.segmentDistanceMeters;
    }
    if (point.speedKph != null && (maxSpeedKph == null || point.speedKph > maxSpeedKph)) {
      maxSpeedKph = point.speedKph;
    }
  }

  const first = ordered[0]?.capturedAt.getTime();
  const last = ordered.at(-1)?.capturedAt.getTime();
  const durationSeconds =
    first == null || last == null ? 0 : Math.max(0, Math.floor((last - first) / 1_000));

  return {
    points: ordered,
    summary: {
      pointCount: ordered.length,
      totalDistanceMeters,
      durationSeconds,
      maxSpeedKph,
    },
  };
}
