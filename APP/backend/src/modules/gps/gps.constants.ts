/**
 * GPS Operations constants. Diamond-owned names — not a vendor API contract.
 */

export const GPS_LATEST_LOCK_NS = "gps_latest";

export const GPS_TRACKING_STATUSES = [
  "not_configured",
  "unassigned",
  "no_data",
  "moving",
  "parked",
  "online",
  "offline",
] as const;
export type GpsTrackingStatusDto = (typeof GPS_TRACKING_STATUSES)[number];

export const GPS_MOTION_STATES = ["unknown", "moving", "parked"] as const;
export type GpsMotionStateDto = (typeof GPS_MOTION_STATES)[number];
