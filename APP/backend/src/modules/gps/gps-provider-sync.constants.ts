import { LIVE_GPS_PROVIDER_KEY } from "src/modules/gps/providers/live-gps/live-gps.constants";

/** Minimum time between provider sync attempts for one account (non–LIVE_GPS). */
export const GPS_PROVIDER_SYNC_CADENCE_MS = 60_000;

export const DEFAULT_LIVE_GPS_SYNC_CADENCE_MS = 5_000;

export function providerSyncCadenceMs(
  providerKey: string,
  liveGpsCadenceMs: number = DEFAULT_LIVE_GPS_SYNC_CADENCE_MS,
): number {
  if (providerKey === LIVE_GPS_PROVIDER_KEY) return liveGpsCadenceMs;
  return GPS_PROVIDER_SYNC_CADENCE_MS;
}

/** Lease TTL — must exceed typical fleet fetch; prevents overlapping owners. */
export const GPS_PROVIDER_SYNC_LEASE_TTL_MS = 120_000;

export const GpsProviderSyncFailureCode = {
  AUTH_FAILED: "AUTH_FAILED",
  TIMEOUT: "TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR",
  PROVIDER_HTTP_ERROR: "PROVIDER_HTTP_ERROR",
  INVALID_PROVIDER_RESPONSE: "INVALID_PROVIDER_RESPONSE",
  UNSUPPORTED_PROVIDER: "UNSUPPORTED_PROVIDER",
  LEASE_LOST: "LEASE_LOST",
  UNEXPECTED: "UNEXPECTED",
} as const;

export type GpsProviderSyncFailureCode =
  (typeof GpsProviderSyncFailureCode)[keyof typeof GpsProviderSyncFailureCode];
