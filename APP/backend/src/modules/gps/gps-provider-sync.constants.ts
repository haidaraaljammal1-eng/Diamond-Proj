/** Minimum time between provider sync attempts for one account. */
export const GPS_PROVIDER_SYNC_CADENCE_MS = 60_000;

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
