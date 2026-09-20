import type {
  GpsMapPointDto,
  GpsSummaryDto,
  GpsTrackingStatus,
  GpsVehicleDetailDto,
  GpsVehicleListItemDto,
} from "../types/gps.types.ts";
import { countsInSummaryOnlineTotal } from "./gps-status.ts";

export type SimulatedGpsTrackingStatus = Extract<
  GpsTrackingStatus,
  "moving" | "parked" | "online" | "offline"
>;

export interface SimulatedGpsFix {
  vehicleId: number;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  headingDegrees: number | null;
  capturedAt: string;
  trackingStatus: SimulatedGpsTrackingStatus;
}

export interface SimulatedGpsOverlay {
  fixes: SimulatedGpsFix[];
  movingVehicleId: number | null;
  path: Array<{ latitude: number; longitude: number }>;
  pathIndex: number;
}

/** Small fixed Dubai-area demo points. Memory only — never sent to Backend. */
export const GPS_DEMO_POINTS = [
  { latitude: 25.1972, longitude: 55.2744 },
  { latitude: 25.1412, longitude: 55.1853 },
  { latitude: 25.0772, longitude: 55.1395 },
  { latitude: 25.2532, longitude: 55.3657 },
  { latitude: 25.1181, longitude: 55.2003 },
  { latitude: 25.2285, longitude: 55.2867 },
  { latitude: 25.0657, longitude: 55.1713 },
  { latitude: 25.0805, longitude: 55.1403 },
] as const;

export const GPS_DEMO_MOVING_PATH = [
  { latitude: 25.2048, longitude: 55.2708 },
  { latitude: 25.1984, longitude: 55.2641 },
  { latitude: 25.1912, longitude: 55.2574 },
  { latitude: 25.1846, longitude: 55.2498 },
  { latitude: 25.1769, longitude: 55.2412 },
  { latitude: 25.1688, longitude: 55.2326 },
] as const;

const DEMO_STATUSES: SimulatedGpsTrackingStatus[] = [
  "moving",
  "moving",
  "parked",
  "parked",
  "online",
  "offline",
];

export function buildGpsSimulationOverlay(
  vehicleIds: number[],
  now: Date = new Date(),
): SimulatedGpsOverlay {
  const ids = vehicleIds.slice(0, 8);
  const capturedAt = now.toISOString();
  const fixes: SimulatedGpsFix[] = ids.map((vehicleId, index) => {
    const trackingStatus = DEMO_STATUSES[index] ?? "parked";
    const point =
      trackingStatus === "moving"
        ? GPS_DEMO_MOVING_PATH[0]
        : GPS_DEMO_POINTS[index % GPS_DEMO_POINTS.length];
    return {
      vehicleId,
      latitude: point.latitude,
      longitude: point.longitude,
      speedKph: trackingStatus === "moving" ? 42 : trackingStatus === "parked" ? 0 : null,
      headingDegrees: trackingStatus === "moving" ? 214 : null,
      capturedAt,
      trackingStatus,
    };
  });
  const movingVehicleId =
    fixes.find((fix) => fix.trackingStatus === "moving")?.vehicleId ?? null;
  return {
    fixes,
    movingVehicleId,
    path: GPS_DEMO_MOVING_PATH.map((point) => ({ ...point })),
    pathIndex: 0,
  };
}

export function advanceGpsSimulationPath(
  overlay: SimulatedGpsOverlay,
): SimulatedGpsOverlay {
  if (!overlay.movingVehicleId || overlay.path.length === 0) return overlay;
  const pathIndex = (overlay.pathIndex + 1) % overlay.path.length;
  const point = overlay.path[pathIndex]!;
  return {
    ...overlay,
    pathIndex,
    fixes: overlay.fixes.map((fix) =>
      fix.vehicleId === overlay.movingVehicleId
        ? { ...fix, latitude: point.latitude, longitude: point.longitude }
        : fix,
    ),
  };
}

function fixFor(
  overlay: SimulatedGpsOverlay | null,
  vehicleId: number,
): SimulatedGpsFix | undefined {
  return overlay?.fixes.find((fix) => fix.vehicleId === vehicleId);
}

export function seedMapPointsFromVehicles(
  vehicles: GpsVehicleListItemDto[],
): GpsMapPointDto[] {
  return vehicles.map((item) => ({
    vehicleId: item.vehicle.id,
    company: item.vehicle.company,
    displayName: item.vehicle.displayName,
    plateNumber: item.vehicle.plateNumber,
    operationalStatus: item.vehicle.operationalStatus,
    trackingStatus: item.gps.trackingStatus,
    latitude: item.gps.latitude ?? 0,
    longitude: item.gps.longitude ?? 0,
    speedKph: item.gps.speedKph,
    headingDegrees: item.gps.headingDegrees,
    capturedAt: item.gps.capturedAt ?? new Date(0).toISOString(),
    currentRental: item.currentRental
      ? {
          contractId: item.currentRental.contractId,
          contractNumber: item.currentRental.contractNumber,
        }
      : null,
  }));
}

/** Real mode never invents markers. Overlay seeds from real vehicles only. */
export function resolveDisplayMapPoints(
  mapPoints: GpsMapPointDto[],
  vehicles: GpsVehicleListItemDto[],
  overlay: SimulatedGpsOverlay | null,
): GpsMapPointDto[] {
  if (!overlay) return mapPoints;
  const seed =
    mapPoints.length > 0 ? mapPoints : seedMapPointsFromVehicles(vehicles);
  return applyGpsOverlayToMapPoints(seed, overlay);
}

export function applyGpsOverlayToMapPoints(
  points: GpsMapPointDto[],
  overlay: SimulatedGpsOverlay | null,
): GpsMapPointDto[] {
  if (!overlay) return points;
  const byId = new Map(points.map((point) => [point.vehicleId, point]));
  return overlay.fixes.map((fix) => {
    const existing = byId.get(fix.vehicleId);
    return {
      vehicleId: fix.vehicleId,
      // No real row behind the fix means no company — never a fabricated one.
      company: existing?.company ?? null,
      displayName: existing?.displayName ?? `Vehicle ${fix.vehicleId}`,
      plateNumber: existing?.plateNumber ?? null,
      operationalStatus: existing?.operationalStatus ?? "available",
      trackingStatus: fix.trackingStatus,
      latitude: fix.latitude,
      longitude: fix.longitude,
      speedKph: fix.speedKph,
      headingDegrees: fix.headingDegrees,
      capturedAt: fix.capturedAt,
      currentRental: existing?.currentRental ?? null,
    };
  });
}

export function applyGpsOverlayToVehicle(
  item: GpsVehicleListItemDto,
  overlay: SimulatedGpsOverlay | null,
): GpsVehicleListItemDto {
  const fix = fixFor(overlay, item.vehicle.id);
  if (!fix) return item;
  return {
    ...item,
    gps: {
      ...item.gps,
      trackingStatus: fix.trackingStatus,
      latitude: fix.latitude,
      longitude: fix.longitude,
      speedKph: fix.speedKph,
      headingDegrees: fix.headingDegrees,
      capturedAt: fix.capturedAt,
      receivedAt: fix.capturedAt,
      motionState:
        fix.trackingStatus === "moving"
          ? "moving"
          : fix.trackingStatus === "parked"
            ? "parked"
            : "unknown",
    },
  };
}

export function applyGpsOverlayToDetail(
  detail: GpsVehicleDetailDto | null,
  overlay: SimulatedGpsOverlay | null,
): GpsVehicleDetailDto | null {
  if (!detail) return null;
  const next = applyGpsOverlayToVehicle(detail, overlay);
  return { ...detail, gps: next.gps, currentRental: next.currentRental };
}

export function applyGpsOverlayToSummary(
  summary: GpsSummaryDto | null,
  overlay: SimulatedGpsOverlay | null,
): GpsSummaryDto | null {
  if (!summary || !overlay) return summary;
  const moving = overlay.fixes.filter((fix) => fix.trackingStatus === "moving").length;
  const parked = overlay.fixes.filter((fix) => fix.trackingStatus === "parked").length;
  const offline = overlay.fixes.filter((fix) => fix.trackingStatus === "offline").length;
  return {
    ...summary,
    trackedVehicles: overlay.fixes.length,
    moving,
    parked,
    online: overlay.fixes.filter((fix) =>
      countsInSummaryOnlineTotal(fix.trackingStatus),
    ).length,
    offline,
    noData: 0,
    unassigned: Math.max(0, summary.totalVehicles - overlay.fixes.length),
    lastLocationUpdateAt:
      overlay.fixes[0]?.capturedAt ?? summary.lastLocationUpdateAt,
  };
}
