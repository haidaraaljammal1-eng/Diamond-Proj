import { createHash } from "node:crypto";
import type {
  ProviderFleetFetchResult,
  ProviderNormalizedSnapshot,
  ProviderNormalizedTelemetry,
} from "src/modules/gps/gps-provider.types";
import { sanitizeGpsProviderExtras } from "src/modules/gps/gps-provider-extras";
import type { SevenStarsDevice, SevenStarsPosition } from "src/modules/gps/providers/seven-stars/seven-stars.types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  const lat = finiteNumber(latitude);
  const lng = finiteNumber(longitude);
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function positionTime(position: SevenStarsPosition): Date | null {
  return parseDate(position.fixTime) ?? parseDate(position.deviceTime);
}

function positionIsLater(candidate: SevenStarsPosition, current: SevenStarsPosition): boolean {
  const candidateFix = parseDate(candidate.fixTime)?.getTime() ?? -Infinity;
  const currentFix = parseDate(current.fixTime)?.getTime() ?? -Infinity;
  if (candidateFix !== currentFix) return candidateFix > currentFix;
  const candidateServer = parseDate(candidate.serverTime)?.getTime() ?? -Infinity;
  const currentServer = parseDate(current.serverTime)?.getTime() ?? -Infinity;
  return candidateServer > currentServer;
}

function speedKnotsToKph(speed: unknown): number | null {
  const knots = finiteNumber(speed);
  return knots != null && knots >= 0 ? knots * 1.852 : null;
}

function sourceEventId(
  providerAccountId: string,
  deviceId: string,
  position: SevenStarsPosition,
  capturedAt: Date,
  latitude: number,
  longitude: number,
): string {
  const providerPositionId = position.id == null ? "" : String(position.id);
  const payload = [
    "SEVEN_STARS",
    providerAccountId,
    deviceId,
    providerPositionId,
    capturedAt.toISOString(),
    latitude.toFixed(7),
    longitude.toFixed(7),
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function mapPosition(
  deviceId: string,
  position: SevenStarsPosition | undefined,
  providerAccountId: string,
  receivedAt: Date,
): ProviderNormalizedTelemetry | null {
  if (!position || position.valid !== true || !validCoordinates(position.latitude, position.longitude)) {
    return null;
  }
  const capturedAt = positionTime(position);
  if (!capturedAt) return null;
  const latitude = position.latitude!;
  const longitude = position.longitude!;
  const attributes = record(position.attributes);
  const ignition = booleanValue(attributes?.ignition) ?? booleanValue(position.engine);
  const extrasInput: Record<string, unknown> = {};
  for (const key of ["motion", "power", "battery", "gpsStatus", "sat"]) {
    const value = attributes?.[key];
    if (value !== undefined && value !== null) extrasInput[key] = value;
  }
  const providerExtras = sanitizeGpsProviderExtras(extrasInput);
  const satellites = finiteNumber(attributes?.sat);
  const heading = finiteNumber(position.course);
  return {
    capturedAt,
    receivedAt: parseDate(position.serverTime) ?? receivedAt,
    latitude,
    longitude,
    speedKph: speedKnotsToKph(position.speed),
    headingDegrees: heading != null && heading >= 0 && heading < 360 ? heading : null,
    providerDeviceState: null,
    addressLine: stringValue(position.address)?.slice(0, 512) ?? null,
    satelliteCount:
      satellites != null && Number.isInteger(satellites) && satellites >= 0
        ? Math.trunc(satellites)
        : null,
    ignitionOn: ignition,
    odometerValue: null,
    odometerUnit: null,
    providerExtras,
    sourceEventId: sourceEventId(
      providerAccountId,
      deviceId,
      position,
      capturedAt,
      latitude,
      longitude,
    ),
  };
}

export function mapSevenStarsFleet(
  devices: unknown[],
  positions: unknown[],
  ctx: { providerAccountId: string; receivedAt: Date },
): ProviderFleetFetchResult {
  const validDevices = devices.filter((value): value is SevenStarsDevice => {
    const item = record(value);
    return item != null && (typeof item.id === "number" || typeof item.id === "string") && String(item.id) !== "";
  });
  const validPositions = positions.filter((value): value is SevenStarsPosition => {
    const item = record(value);
    return item != null && (typeof item.deviceId === "number" || typeof item.deviceId === "string");
  });
  const latestByDevice = new Map<string, SevenStarsPosition>();
  for (const position of validPositions) {
    const key = String(position.deviceId);
    const current = latestByDevice.get(key);
    if (!current || positionIsLater(position, current)) latestByDevice.set(key, position);
  }
  const snapshots: ProviderNormalizedSnapshot[] = validDevices.map((device) => {
    const externalDeviceId = String(device.id);
    const position = latestByDevice.get(externalDeviceId);
    const telemetry = mapPosition(externalDeviceId, position, ctx.providerAccountId, ctx.receivedAt);
    const deviceExtras: Record<string, unknown> = {};
    const status = stringValue(device.status);
    const category = stringValue(device.category);
    const disabled = booleanValue(device.disabled);
    if (status != null) deviceExtras.status = status;
    if (category != null) deviceExtras.category = category;
    if (disabled != null) deviceExtras.disabled = disabled;
    return {
      externalDeviceId,
      deviceMetadata: {
        externalDeviceUid: stringValue(device.uniqueId),
        deviceType: stringValue(device.model) ?? stringValue(device.category),
        providerDeviceExtras: sanitizeGpsProviderExtras(deviceExtras),
      },
      telemetry,
    };
  });
  return {
    providerAccountId: ctx.providerAccountId,
    snapshots,
    validRowCount: snapshots.length,
    invalidRowCount: devices.length - validDevices.length,
    timezoneOffset: null,
  };
}
