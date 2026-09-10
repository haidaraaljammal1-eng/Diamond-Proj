import type { GpsMapPointDto, GpsTrackingStatus } from "../types/gps.types.ts";

export const DUBAI_DEFAULT_CENTER = {
  latitude: 25.2048,
  longitude: 55.2708,
} as const;

export const DUBAI_DEFAULT_ZOOM = 11;

export interface GpsMarkerProjection {
  vehicleId: number;
  latitude: number;
  longitude: number;
  trackingStatus: GpsTrackingStatus;
  headingDegrees: number | null;
  label: string;
}

export function projectMapMarkers(points: GpsMapPointDto[]): GpsMarkerProjection[] {
  return points.map((point) => ({
    vehicleId: point.vehicleId,
    latitude: point.latitude,
    longitude: point.longitude,
    trackingStatus: point.trackingStatus,
    headingDegrees: point.headingDegrees,
    label: point.plateNumber?.trim() || point.displayName,
  }));
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
