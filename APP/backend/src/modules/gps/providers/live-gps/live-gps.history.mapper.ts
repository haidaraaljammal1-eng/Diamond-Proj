import type { ProviderNormalizedHistoryPoint } from "src/modules/gps/gps-provider.types";
import { buildLiveGpsProviderExtras } from "src/modules/gps/providers/live-gps/live-gps.extras";
import {
  asFiniteNumber,
  asString,
  isRecord,
} from "src/modules/gps/providers/live-gps/live-gps.parse";
import { parseLiveGpsLocalDateTime } from "src/modules/gps/providers/live-gps/live-gps.time";

export function mapLiveGpsHistoryRow(
  row: unknown,
  ctx: {
    timezoneOffset: string;
    externalDeviceId: string;
  },
): ProviderNormalizedHistoryPoint | null {
  if (!isRecord(row)) return null;
  const rowDeviceId = asString(row.deviceid);
  if (rowDeviceId && rowDeviceId !== ctx.externalDeviceId) return null;
  const lat = asFiniteNumber(row.lat);
  const lng = asFiniteNumber(row.lon);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  const deviceDt = asString(row.device_dt);
  if (!deviceDt) return null;
  const capturedAt = parseLiveGpsLocalDateTime(deviceDt, ctx.timezoneOffset);
  if (!capturedAt) return null;

  const speed = asFiniteNumber(row.speed);
  const segment = asFiniteNumber(row.meter);

  const extras = buildLiveGpsProviderExtras({
    rawMotion: row.motion,
  });

  return {
    capturedAt,
    latitude: lat,
    longitude: lng,
    speedKph: speed != null && speed >= 0 ? speed : null,
    segmentDistanceMeters: segment != null && segment >= 0 ? segment : null,
    addressLine: (() => {
      const a = asString(row.address);
      return a ? a.slice(0, 512) : null;
    })(),
    providerExtras: extras,
  };
}
