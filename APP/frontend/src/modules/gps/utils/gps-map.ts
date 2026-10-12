import type { GpsMapPointDto, GpsTrackingStatus } from "../types/gps.types.ts";

export const DUBAI_DEFAULT_CENTER = {
  latitude: 25.2048,
  longitude: 55.2708,
} as const;

export const DUBAI_DEFAULT_ZOOM = 11;

/** Minimum zoom when entering single-vehicle map focus (camera only). */
export const GPS_MAP_FOCUS_MIN_ZOOM = 16;

/** Leaflet flyTo duration (seconds) when entering map focus. */
export const GPS_MAP_FOCUS_FLY_DURATION_S = 1;

export function filterMapPointsForFocus(
  points: GpsMapPointDto[],
  focusedMapVehicleId: number | null,
): GpsMapPointDto[] {
  if (focusedMapVehicleId == null) return points;
  return points.filter((point) => point.vehicleId === focusedMapVehicleId);
}

export interface GpsMarkerProjection {
  vehicleId: number;
  latitude: number;
  longitude: number;
  trackingStatus: GpsTrackingStatus;
  headingDegrees: number | null;
  label: string;
  capturedAt: string;
}

export function projectMapMarkers(points: GpsMapPointDto[]): GpsMarkerProjection[] {
  return points.map((point) => ({
    vehicleId: point.vehicleId,
    latitude: point.latitude,
    longitude: point.longitude,
    trackingStatus: point.trackingStatus,
    headingDegrees: point.headingDegrees,
    label: point.plateNumber?.trim() || point.displayName,
    capturedAt: point.capturedAt,
  }));
}

export interface GpsCoordinate {
  latitude: number;
  longitude: number;
}

export function interpolateCoordinate(
  from: GpsCoordinate,
  to: GpsCoordinate,
  progress: number,
): GpsCoordinate {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = clamped * (2 - clamped);
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * eased,
    longitude: from.longitude + (to.longitude - from.longitude) * eased,
  };
}

const METERS_PER_DEGREE_LATITUDE = 111_320;
const MAX_ANIMATION_DISTANCE_METERS = 2_000;
const MAX_ANIMATION_GAP_MS = 120_000;

export function distanceBetweenCoordinates(
  from: GpsCoordinate,
  to: GpsCoordinate,
): number {
  const latitudeRadians = ((from.latitude + to.latitude) / 2) * (Math.PI / 180);
  const latitudeMeters = (to.latitude - from.latitude) * METERS_PER_DEGREE_LATITUDE;
  const longitudeMeters =
    (to.longitude - from.longitude) *
    METERS_PER_DEGREE_LATITUDE *
    Math.cos(latitudeRadians);
  return Math.hypot(latitudeMeters, longitudeMeters);
}

export function shouldSnapMarker(
  from: GpsCoordinate,
  to: GpsCoordinate,
  previousCapturedAt: string | null,
  capturedAt: string,
): boolean {
  if (!previousCapturedAt) return true;
  const gap = new Date(capturedAt).getTime() - new Date(previousCapturedAt).getTime();
  return (
    gap <= 0 ||
    gap > MAX_ANIMATION_GAP_MS ||
    distanceBetweenCoordinates(from, to) > MAX_ANIMATION_DISTANCE_METERS
  );
}

export function markerAnimationDurationMs(
  previousCapturedAt: string,
  capturedAt: string,
): number {
  const gap = Math.max(
    0,
    new Date(capturedAt).getTime() - new Date(previousCapturedAt).getTime(),
  );
  return Math.min(3_800, Math.max(500, Math.round(gap * 0.8)));
}

export function markerModifier(status: GpsTrackingStatus): string {
  if (status === "moving") return "moving";
  if (status === "parked") return "parked";
  if (status === "online") return "online";
  if (status === "offline") return "offline";
  return "neutral";
}

export function boundsFromMarkers(
  markers: GpsMarkerProjection[],
): Array<[number, number]> {
  return markers.map((marker) => [marker.latitude, marker.longitude]);
}

export interface LeafletBox {
  width: number;
  height: number;
}

/** True when the layout box is usable and actually changed — avoids extra invalidateSize calls. */
export function shouldInvalidateLeafletSize(
  previous: LeafletBox,
  next: LeafletBox,
): boolean {
  if (next.width < 1 || next.height < 1) return false;
  return previous.width !== next.width || previous.height !== next.height;
}
