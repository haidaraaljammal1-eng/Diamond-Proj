import type {
  ProviderNormalizedSnapshot,
  ProviderNormalizedTelemetry,
} from "src/modules/gps/gps-provider.types";
import { buildLiveGpsProviderExtras } from "src/modules/gps/providers/live-gps/live-gps.extras";
import {
  asBoolean,
  asFiniteNumber,
  asString,
  isRecord,
} from "src/modules/gps/providers/live-gps/live-gps.parse";
import { buildLiveGpsSourceEventId } from "src/modules/gps/providers/live-gps/live-gps.source-event";
import {
  isValidTimezoneOffset,
  parseLiveGpsLastData,
  parseLiveGpsLocalDateTime,
} from "src/modules/gps/providers/live-gps/live-gps.time";

function validLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function pairCoords(
  lat: number | null,
  lng: number | null,
): { latitude: number; longitude: number } | null {
  if (lat == null || lng == null) return null;
  if (!validLatLng(lat, lng)) return null;
  return { latitude: lat, longitude: lng };
}

export function mapLiveGpsFleetRow(
  row: unknown,
  ctx: {
    providerAccountId: string;
    defaultOffset: string | null;
    receivedAt: Date;
  },
): ProviderNormalizedSnapshot | null {
  if (!isRecord(row)) return null;
  const deviceId = asString(row.deviceid);
  if (!deviceId) return null;

  const offsetRaw = asString(row.UTimeZone) ?? ctx.defaultOffset;
  const offset = offsetRaw && isValidTimezoneOffset(offsetRaw) ? offsetRaw : null;

  const installRaw = asString(row.InstallationDate) ?? asString(row.installationdate);
  let installationDate: Date | null = null;
  if (installRaw && offset) {
    installationDate = parseLiveGpsLocalDateTime(installRaw, offset);
  }

  const expiredRaw = asString(row.experied);
  let subscriptionExpiresAt: Date | null = null;
  if (expiredRaw && offset) {
    subscriptionExpiresAt = parseLiveGpsLocalDateTime(expiredRaw, offset);
  }

  const cutdateRaw = asString(row.Cutdate);
  let snapshotReferenceAt: Date | null = null;
  if (cutdateRaw && offset) {
    snapshotReferenceAt = parseLiveGpsLocalDateTime(cutdateRaw, offset);
  }

  const coords = pairCoords(
    asFiniteNumber(row.lastlatitude),
    asFiniteNumber(row.lastlongitude),
  );
  const prev = pairCoords(
    asFiniteNumber(row.preLatitude),
    asFiniteNumber(row.preLongitude),
  );

  let telemetry: ProviderNormalizedTelemetry | null = null;
  if (coords && offset) {
    const capturedAt = parseLiveGpsLastData(
      asString(row.lastdata),
      asString(row.deviceLastData),
      offset,
    );
    if (capturedAt) {
      const speed = asFiniteNumber(row.speed);
      const sourceEventId = buildLiveGpsSourceEventId({
        providerAccountId: ctx.providerAccountId,
        externalDeviceId: deviceId,
        capturedAt,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      const sat = asFiniteNumber(row.sat);
      const extras = buildLiveGpsProviderExtras({
        dataAgeSeconds: asFiniteNumber(row.overallsec),
        dataAgeMinutes: asFiniteNumber(row.lastmin),
        providerStatusDurationSeconds: asFiniteNumber(row.LastSec),
        providerStatusDurationText: asString(row.shr),
        providerLastDays: asFiniteNumber(row.LastDays),
        providerDeviceOnOff: asString(row.DeviceOnOFF),
        rawMotion: row.motion,
        rawActMotion: row.actmotion,
        rawActIgnition: row.actign,
        rawActSpeed: row.actspeed,
        rawFuel: row.fuel,
        rawCharge: row.charge,
        rawBatteryLevel: row.batterylevel,
        rawImmobilizeFlag: row.immobilize,
        snapshotReferenceIso: snapshotReferenceAt?.toISOString() ?? undefined,
      });
      telemetry = {
        capturedAt,
        receivedAt: ctx.receivedAt,
        latitude: coords.latitude,
        longitude: coords.longitude,
        speedKph: speed != null && speed >= 0 ? speed : null,
        headingDegrees: (() => {
          const ang = asFiniteNumber(row.ang);
          if (ang == null || ang < 0 || ang >= 360) return null;
          return ang;
        })(),
        previousLatitude: prev?.latitude ?? null,
        previousLongitude: prev?.longitude ?? null,
        providerDeviceState: asString(row.status),
        addressLine: (() => {
          const a = asString(row.address);
          return a ? a.slice(0, 512) : null;
        })(),
        satelliteCount:
          sat != null && Number.isInteger(sat) && sat >= 0 ? Math.trunc(sat) : null,
        parkingEnabled: asBoolean(row.parkingenable),
        ignitionOn: asBoolean(row.ign),
        odometerValue: asFiniteNumber(row.meter),
        odometerUnit: asFiniteNumber(row.meter) != null ? "METER" : null,
        distanceTodayValue: asFiniteNumber(row.driventoday),
        distanceTodayUnit: asFiniteNumber(row.driventoday) != null ? "KILOMETER" : null,
        providerExtras: extras,
        sourceEventId,
      };
    }
  }

  return {
    externalDeviceId: deviceId,
    deviceMetadata: {
      externalDeviceUid: asString(row.deviceimei),
      deviceType: asString(row.devicetype),
      providerDeviceTypeId: asString(row.devicetypeid),
      simNumber: asString(row.SimNo) ?? asString(row.simno),
      installationType: asString(row.installtype),
      installationDate,
      subscriptionExpiresAt,
      providerDeviceExtras: null,
    },
    telemetry,
    snapshotReferenceAt,
  };
}

export function mapLiveGpsFleetRows(
  rows: unknown[],
  ctx: {
    providerAccountId: string;
    defaultOffset: string | null;
    receivedAt: Date;
  },
): { snapshots: ProviderNormalizedSnapshot[]; valid: number; invalid: number } {
  const snapshots: ProviderNormalizedSnapshot[] = [];
  let invalid = 0;
  for (const row of rows) {
    const mapped = mapLiveGpsFleetRow(row, ctx);
    if (!mapped) {
      invalid += 1;
      continue;
    }
    snapshots.push(mapped);
  }
  return { snapshots, valid: snapshots.length, invalid };
}
