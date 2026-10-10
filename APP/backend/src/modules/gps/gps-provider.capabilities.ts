/**
 * Adapter-level capability flags — what a provider integration can map, not what
 * every device hardware supports.
 */
export interface GpsProviderCapabilities {
  liveLocation: boolean;
  speed: boolean;
  ignition: boolean;
  odometer: boolean;
  address: boolean;
  battery: boolean;
  fuel: boolean;
  history: boolean;
  mileageSummary: boolean;
  overspeedReport: boolean;
  deviceMetadata: boolean;
  trips: boolean;
  geofences: boolean;
  alerts: boolean;
  /** UI/metadata only — no remote commands in Diamond V1. */
  immobilize: boolean;
}

export const GPS_CAPABILITIES_NONE: GpsProviderCapabilities = {
  liveLocation: false,
  speed: false,
  ignition: false,
  odometer: false,
  address: false,
  battery: false,
  fuel: false,
  history: false,
  mileageSummary: false,
  overspeedReport: false,
  deviceMetadata: false,
  trips: false,
  geofences: false,
  alerts: false,
  immobilize: false,
};
