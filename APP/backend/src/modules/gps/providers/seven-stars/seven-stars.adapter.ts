import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import type { GpsProviderCapabilities } from "src/modules/gps/gps-provider.capabilities";
import type {
  GpsProviderFleetFetchContext,
  GpsProviderSyncRuntime,
  ProviderFleetFetchResult,
} from "src/modules/gps/gps-provider.types";
import { gpsProviderInvalidResponseError, gpsProviderNotConfiguredError } from "src/modules/gps/gps.errors";
import {
  createSevenStarsClient,
  type SevenStarsClientContext,
  type SevenStarsClientOptions,
} from "src/modules/gps/providers/seven-stars/seven-stars.client";
import { mapSevenStarsFleet } from "src/modules/gps/providers/seven-stars/seven-stars.mapper";
import { SEVEN_STARS_PROVIDER_KEY } from "src/modules/gps/providers/seven-stars/seven-stars.constants";
import type { SevenStarsSessionManager } from "src/modules/gps/providers/seven-stars/seven-stars.session";

const SEVEN_STARS_CAPABILITIES: GpsProviderCapabilities = {
  liveLocation: true,
  speed: true,
  ignition: true,
  odometer: false,
  address: true,
  battery: false,
  fuel: false,
  history: false,
  mileageSummary: false,
  overspeedReport: false,
  deviceMetadata: true,
  trips: false,
  geofences: false,
  alerts: false,
  immobilize: false,
};

export class SevenStarsAdapter implements GpsProviderAdapter {
  readonly providerKey = SEVEN_STARS_PROVIDER_KEY;
  readonly displayName = "Seven Stars";
  readonly staticCapabilities = SEVEN_STARS_CAPABILITIES;
  readonly supportsFleetSync = true;
  private readonly clientOptions: SevenStarsClientOptions;

  constructor(clientOptions: SevenStarsClientOptions = {}) {
    this.clientOptions = clientOptions;
  }

  private getClient(runtime: GpsProviderSyncRuntime) {
    const sessionManager = runtime.getSessionManager<SevenStarsSessionManager>(this.providerKey);
    return createSevenStarsClient({ ...this.clientOptions, sessionManager });
  }

  async fetchFleetSnapshot(
    ctx: GpsProviderFleetFetchContext,
    runtime: GpsProviderSyncRuntime,
  ): Promise<ProviderFleetFetchResult> {
    const username = ctx.credentials.username?.trim();
    const password = ctx.credentials.password?.trim();
    if (!username || !password) throw gpsProviderNotConfiguredError();
    const client = this.getClient(runtime);
    const providerContext: SevenStarsClientContext = {
      providerAccountId: ctx.providerAccountId,
      credentials: { username, password },
    };
    const [devices, positions] = await Promise.all([
      client.fetchDevices(providerContext),
      client.fetchPositions(providerContext),
    ]);
    if (!Array.isArray(devices) || !Array.isArray(positions)) {
      throw gpsProviderInvalidResponseError();
    }
    return mapSevenStarsFleet(devices, positions, {
      providerAccountId: ctx.providerAccountId,
      receivedAt: new Date(),
    });
  }
}

export function createSevenStarsAdapter(options: SevenStarsClientOptions = {}) {
  return new SevenStarsAdapter(options);
}
