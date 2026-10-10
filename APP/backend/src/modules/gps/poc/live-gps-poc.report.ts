import type { ProviderNormalizedSnapshot } from "src/modules/gps/gps-provider.types";
import {
  asFiniteNumber,
  asString,
  isRecord,
} from "src/modules/gps/providers/live-gps/live-gps.parse";
import {
  isValidTimezoneOffset,
  parseLiveGpsLastData,
  parseLiveGpsLocalDateTime,
} from "src/modules/gps/providers/live-gps/live-gps.time";

export type FleetRowValidationIssue =
  | "MISSING_DEVICE_ID"
  | "INVALID_TIMESTAMP"
  | "INVALID_LOCATION"
  | "INVALID_TOP_LEVEL_ROW";

const TIMESTAMP_TOLERANCE_SECONDS = 120;

export function diagnoseLiveGpsFleetRow(row: unknown): FleetRowValidationIssue | null {
  if (!isRecord(row)) return "INVALID_TOP_LEVEL_ROW";
  if (!asString(row.deviceid)) return "MISSING_DEVICE_ID";
  const offset = asString(row.UTimeZone);
  const lat = asFiniteNumber(row.lastlatitude);
  const lng = asFiniteNumber(row.lastlongitude);
  const hasCoords =
    lat != null &&
    lng != null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
  if (!hasCoords) return "INVALID_LOCATION";
  if (!offset || !isValidTimezoneOffset(offset)) return "INVALID_TIMESTAMP";
  const capturedAt = parseLiveGpsLastData(
    asString(row.lastdata),
    asString(row.deviceLastData),
    offset,
  );
  if (!capturedAt) return "INVALID_TIMESTAMP";
  return null;
}

export function classifyTimestampConsistency(row: unknown): "consistent" | "inconsistent" | "skipped" {
  if (!isRecord(row)) return "skipped";
  const offset = asString(row.UTimeZone);
  if (!offset || !isValidTimezoneOffset(offset)) return "skipped";
  const lastdata = parseLiveGpsLastData(
    asString(row.lastdata),
    asString(row.deviceLastData),
    offset,
  );
  const cutdate = parseLiveGpsLocalDateTime(asString(row.Cutdate) ?? "", offset);
  const overallsec = asFiniteNumber(row.overallsec);
  if (!lastdata || !cutdate || overallsec == null) return "skipped";
  const diffSec = (cutdate.getTime() - lastdata.getTime()) / 1000;
  if (!Number.isFinite(diffSec)) return "skipped";
  return Math.abs(diffSec - overallsec) <= TIMESTAMP_TOLERANCE_SECONDS
    ? "consistent"
    : "inconsistent";
}

export function aggregateSnapshots(snapshots: ProviderNormalizedSnapshot[]) {
  let withValidLocation = 0;
  let withValidCapturedAt = 0;
  let withSpeed = 0;
  let withOdometer = 0;
  let withDistanceToday = 0;
  let deviceOnOffInExtrasOnly = 0;

  for (const s of snapshots) {
    const t = s.telemetry;
    if (t) {
      withValidLocation += 1;
      withValidCapturedAt += 1;
      if (t.speedKph != null) withSpeed += 1;
      if (t.odometerValue != null && t.odometerUnit === "METER") withOdometer += 1;
      if (t.distanceTodayValue != null && t.distanceTodayUnit === "KILOMETER") {
        withDistanceToday += 1;
      }
      const extras = t.providerExtras;
      if (extras && typeof extras.providerDeviceOnOff === "string") {
        deviceOnOffInExtrasOnly += 1;
      }
    }
  }

  return {
    mappedRows: snapshots.length,
    withValidLocation,
    withValidCapturedAt,
    withSpeed,
    withOdometer,
    withDistanceToday,
    deviceOnOffInExtrasOnly,
  };
}

export function collectTimezoneOffsets(rows: unknown[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const tz = asString(row.UTimeZone);
    if (tz && isValidTimezoneOffset(tz)) set.add(tz);
  }
  return [...set].sort();
}

export function externalDeviceIdSet(rows: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = asString(row.deviceid);
    if (id) ids.add(id);
  }
  return ids;
}
