import type {
  GpsDisplayMotionStatus,
  GpsLocationDto,
  GpsMotionState,
  GpsTrackingStatus,
} from "../types/gps.types.ts";

type ChipTone = "neutral" | "ok" | "warn" | "bad" | "gold";

/** Align with backend `gpsConfig()` defaults (`GPS_MOTION_STALE_AFTER_MINUTES`, `GPS_MOVING_SPEED_THRESHOLD_KPH`). */
export const GPS_DISPLAY_MOTION_DEFAULTS = {
  motionStaleAfterMinutes: 2,
  movingThresholdKph: 3,
} as const;

export const GPS_TRACKING_LABEL_KEYS: Record<GpsTrackingStatus, string> = {
  moving: "status.moving",
  idle: "status.idle",
  parked: "status.parked",
  online: "status.online",
  offline: "status.offline",
  no_data: "status.no_data",
  unassigned: "status.unassigned",
  not_configured: "status.not_configured",
};

export function trackingChipTone(status: GpsTrackingStatus | GpsDisplayMotionStatus): ChipTone {
  if (status === "moving") return "ok";
  if (status === "idle") return "warn";
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

function motionStateToBackend(
  motionState: GpsMotionState | null,
): "UNKNOWN" | "MOVING" | "PARKED" {
  if (motionState === "moving") return "MOVING";
  if (motionState === "parked") return "PARKED";
  return "UNKNOWN";
}

function offlineCutoff(now: Date, offlineAfterMinutes: number): Date {
  return new Date(now.getTime() - offlineAfterMinutes * 60_000);
}

/**
 * Display motion for row badges — same semantics as backend `deriveDisplayMotionStatus`.
 * Does not use connectivity `trackingStatus` (offline/online) for the badge label.
 */
export function deriveDisplayMotionStatus(input: {
  providerConfigured: boolean;
  bindingActive: boolean;
  capturedAt: Date | null;
  motionState: GpsMotionState | null;
  speedKph: number | null;
  ignitionOn: boolean | null;
  now: Date;
  motionStaleAfterMinutes?: number;
  movingThresholdKph?: number;
}): GpsDisplayMotionStatus {
  const motionStaleAfterMinutes =
    input.motionStaleAfterMinutes ?? GPS_DISPLAY_MOTION_DEFAULTS.motionStaleAfterMinutes;
  const movingThresholdKph =
    input.movingThresholdKph ?? GPS_DISPLAY_MOTION_DEFAULTS.movingThresholdKph;

  if (!input.providerConfigured || !input.bindingActive || !input.capturedAt) {
    return "parked";
  }

  const cutoff = offlineCutoff(input.now, motionStaleAfterMinutes);
  const isFresh = input.capturedAt.getTime() >= cutoff.getTime();
  if (!isFresh) return "parked";

  const motion = motionStateToBackend(input.motionState);
  const speed = input.speedKph;
  const isMoving =
    motion === "MOVING" || (speed != null && speed > movingThresholdKph);
  if (isMoving) return "moving";

  if (input.ignitionOn === true) return "idle";

  return "parked";
}

/** Row badge source: list `gps` projection + clock. */
export function displayMotionStatusFromGpsLocation(
  gps: GpsLocationDto,
  now: Date,
  thresholds?: {
    motionStaleAfterMinutes?: number;
    movingThresholdKph?: number;
  },
): GpsDisplayMotionStatus {
  const providerConfigured = gps.trackingStatus !== "not_configured";
  const bindingActive = gps.trackingStatus !== "unassigned";

  return deriveDisplayMotionStatus({
    providerConfigured,
    bindingActive,
    capturedAt: toValidGpsDate(gps.capturedAt),
    motionState: gps.motionState,
    speedKph: gps.speedKph,
    ignitionOn: gps.ignitionOn,
    now,
    ...thresholds,
  });
}
