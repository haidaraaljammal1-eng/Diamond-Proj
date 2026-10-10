/**
 * Provider-neutral structures produced by vendor adapters before vehicle binding.
 * Adapters never know Diamond vehicleId.
 */

export type ProviderDeviceMetadata = {
  externalDeviceUid?: string | null;
  deviceType?: string | null;
  providerDeviceTypeId?: string | null;
  simNumber?: string | null;
  installationType?: string | null;
  installationDate?: Date | null;
  subscriptionExpiresAt?: Date | null;
  providerDeviceExtras?: Record<string, unknown> | null;
};

/** Telemetry fields aligned with ingest minus vehicleId. */
export type ProviderNormalizedTelemetry = {
  capturedAt: Date;
  receivedAt?: Date;
  latitude: number;
  longitude: number;
  speedKph?: number | null;
  headingDegrees?: number | null;
  previousLatitude?: number | null;
  previousLongitude?: number | null;
  providerDeviceState?: string | null;
  addressLine?: string | null;
  satelliteCount?: number | null;
  parkingEnabled?: boolean | null;
  ignitionOn?: boolean | null;
  odometerValue?: number | null;
  odometerUnit?: string | null;
  distanceTodayValue?: number | null;
  distanceTodayUnit?: string | null;
  providerExtras?: Record<string, unknown> | null;
  sourceEventId: string;
};

export type ProviderNormalizedSnapshot = {
  externalDeviceId: string;
  deviceMetadata: ProviderDeviceMetadata;
  telemetry: ProviderNormalizedTelemetry | null;
  /** Provider snapshot reference time (e.g. Cutdate) — not device fix time. */
  snapshotReferenceAt?: Date | null;
};

export type ProviderNormalizedHistoryPoint = {
  capturedAt: Date;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  segmentDistanceMeters: number | null;
  addressLine: string | null;
  providerExtras?: Record<string, unknown> | null;
};

export type ProviderHistoryFetchResult = {
  points: ProviderNormalizedHistoryPoint[];
  providerRowCount: number;
  invalidRowCount: number;
};

export type ProviderMileageSummary = {
  todayKm: number;
  yesterdayKm: number;
  thisMonthKm: number;
  lastMonthKm: number;
};

export type ProviderOverspeedEvent = {
  startedAt: Date;
  endedAt: Date;
  averageSpeedKph: number;
  maxSpeedKph: number;
  durationMinutes: number;
  addressLine: string | null;
};

export type ProviderOverspeedFetchResult = {
  events: ProviderOverspeedEvent[];
  providerRowCount: number;
  invalidRowCount: number;
};

export type ProviderDeviceModelResult = {
  deviceModel: string | null;
};

export type GpsProviderMetadataFetchContext = GpsProviderAccountContext & {
  externalDeviceId: string;
};

export type GpsProviderReportContext = GpsProviderAccountContext & {
  externalDeviceId: string;
};

export type ProviderFleetFetchResult = {
  providerAccountId: string;
  snapshots: ProviderNormalizedSnapshot[];
  validRowCount: number;
  invalidRowCount: number;
  timezoneOffset: string | null;
};

/** Decrypted account context for a single fleet read (no vehicle binding). */
export type GpsProviderAccountContext = {
  providerAccountId: string;
  providerKey: string;
  accountKey: string;
  config: Record<string, unknown> | null;
  credentials: Record<string, string>;
};

export type GpsProviderFleetFetchContext = GpsProviderAccountContext;

export type GpsProviderHistoryFetchContext = GpsProviderAccountContext & {
  externalDeviceId: string;
  from: Date;
  to: Date;
};

/** Shared runtime dependencies for provider adapters. */
export type GpsProviderRuntime = {
  liveGpsSessionManager: import("src/modules/gps/providers/live-gps/live-gps.session").LiveGpsSessionManager;
};

export type GpsProviderSyncRuntime = GpsProviderRuntime;
