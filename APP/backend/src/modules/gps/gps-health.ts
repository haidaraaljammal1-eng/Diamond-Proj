export const GPS_HEALTH_ONLINE_AFTER_SECONDS = 2 * 60;

export type GpsHealthStatus = "ONLINE" | "STALE" | "OFFLINE";

export function deriveGpsHealth(input: {
  capturedAt: Date | null;
  now: Date;
  offlineAfterMinutes: number;
}): { health: GpsHealthStatus; ageSeconds: number | null } {
  if (!input.capturedAt) {
    return { health: "OFFLINE", ageSeconds: null };
  }

  const ageSeconds = Math.max(
    0,
    Math.floor((input.now.getTime() - input.capturedAt.getTime()) / 1000),
  );
  if (ageSeconds <= GPS_HEALTH_ONLINE_AFTER_SECONDS) {
    return { health: "ONLINE", ageSeconds };
  }
  if (ageSeconds <= input.offlineAfterMinutes * 60) {
    return { health: "STALE", ageSeconds };
  }
  return { health: "OFFLINE", ageSeconds };
}
