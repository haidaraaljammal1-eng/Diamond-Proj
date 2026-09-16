/**
 * Vendor-neutral GPS provider boundary.
 *
 * Do not assume a vendor URL, authentication type, IMEI format, webhook, or
 * device-command API. A future real adapter implements this interface from
 * official documentation and translates vendor payloads into Diamond
 * normalized positions before calling ingest — never from Vehicles/Contracts.
 */
export interface GpsProvider {
  readonly name: string;
  /** False until a real, credentialed adapter exists. */
  readonly configured: boolean;
}

export interface GpsConfig {
  enabled: boolean;
  offlineAfterMinutes: number;
  movingSpeedThresholdKph: number;
}

export interface NormalizedGpsPositionInput {
  vehicleId: number;
  capturedAt: Date;
  receivedAt?: Date;
  latitude: number;
  longitude: number;
  speedKph?: number | null;
  headingDegrees?: number | null;
  accuracyMeters?: number | null;
  sourceEventId?: string | null;
}

export interface GpsBindingSnapshot {
  id: string;
  isActive: boolean;
}

export interface GpsLatestSnapshot {
  latitude: number;
  longitude: number;
  speedKph: number | null;
  headingDegrees: number | null;
  accuracyMeters: number | null;
  motionState: "UNKNOWN" | "MOVING" | "PARKED";
  capturedAt: Date;
  receivedAt: Date;
  sourceEventId: string | null;
}

export type GpsIngestOutcome =
  | { applied: true; reason: "created" | "replaced" }
  | { applied: false; reason: "stale" | "duplicate_event" };

/** Previous/current points from an accepted ingest — used by observers, never persisted as a route. */
export interface GpsAcceptedPoint {
  latitude: number;
  longitude: number;
  capturedAt: Date;
  headingDegrees: number | null;
}

export interface GpsAcceptedPositionEvent {
  vehicleId: number;
  previous: GpsAcceptedPoint;
  current: GpsAcceptedPoint;
}

export interface GpsAcceptedPositionObserver {
  onAcceptedPosition(event: GpsAcceptedPositionEvent): Promise<void>;
}
