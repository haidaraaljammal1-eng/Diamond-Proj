import type { GpsTrackingStatus } from "../types/gps.types.ts";

type ChipTone = "neutral" | "ok" | "warn" | "bad" | "gold";

export const GPS_TRACKING_LABEL_KEYS: Record<GpsTrackingStatus, string> = {
  moving: "status.moving",
  parked: "status.parked",
  online: "status.online",
  offline: "status.offline",
  no_data: "status.no_data",
  unassigned: "status.unassigned",
  not_configured: "status.not_configured",
};

export function trackingChipTone(status: GpsTrackingStatus): ChipTone {
  if (status === "moving") return "ok";
  if (status === "parked") return "gold";
  if (status === "online") return "neutral";
  if (status === "offline") return "warn";
  return "neutral";
}

/** Summary Online KPI = fresh GPS location. Distinct from row-level `online`. */
export function countsInSummaryOnlineTotal(status: GpsTrackingStatus): boolean {
  return status === "moving" || status === "parked" || status === "online";
}

export function hasMapCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return typeof latitude === "number" && typeof longitude === "number";
}

export function formatGpsCoordinates(
  latitude: number,
  longitude: number,
): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

/** Parse a GPS timestamp only when it is a real instant. Never feed Invalid Date to relativeTime. */
export function toValidGpsDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
