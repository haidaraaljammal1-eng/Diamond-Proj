import { env } from "src/config/env";
import type { GpsConfig } from "src/modules/gps/gps.types";

export function gpsConfig(): GpsConfig {
  return {
    enabled: env.GPS_ENABLED,
    offlineAfterMinutes: env.GPS_OFFLINE_AFTER_MINUTES,
    movingSpeedThresholdKph: env.GPS_MOVING_SPEED_THRESHOLD_KPH,
  };
}
