import { GPS_CAPABILITIES_NONE } from "src/modules/gps/gps-provider.capabilities";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";

/** Fallback registry entry — not used for fleet sync. */
export class GpsUnconfiguredAdapter implements GpsProviderAdapter {
  readonly providerKey = "none";
  readonly displayName = "Not configured";
  readonly staticCapabilities = GPS_CAPABILITIES_NONE;
  readonly supportsFleetSync = false;
}
