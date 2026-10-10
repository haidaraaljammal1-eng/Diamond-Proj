import type { GpsProviderCapabilities } from "src/modules/gps/gps-provider.capabilities";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import type {
  GpsProviderFleetFetchContext,
  GpsProviderHistoryFetchContext,
  GpsProviderRuntime,
  GpsProviderReportContext,
  GpsProviderMetadataFetchContext,
  GpsProviderSyncRuntime,
  ProviderFleetFetchResult,
  ProviderHistoryFetchResult,
  ProviderMileageSummary,
  ProviderOverspeedFetchResult,
  ProviderDeviceModelResult,
} from "src/modules/gps/gps-provider.types";
import {
  gpsProviderInvalidResponseError,
  gpsProviderNotConfiguredError,
} from "src/modules/gps/gps.errors";
import {
  LIVE_GPS_PROVIDER_KEY,
} from "src/modules/gps/providers/live-gps/live-gps.constants";
import {
  createLiveGpsClient,
  type LiveGpsClientContext,
  type LiveGpsClientOptions,
} from "src/modules/gps/providers/live-gps/live-gps.client";
import {
  formatLiveGpsLocalDateTime,
  resolveLiveGpsTimezoneOffset,
} from "src/modules/gps/providers/live-gps/live-gps.time";

const LIVE_GPS_CAPABILITIES: GpsProviderCapabilities = {
  liveLocation: true,
  speed: true,
  ignition: true,
  odometer: true,
  address: true,
  battery: false,
  fuel: false,
  history: true,
  mileageSummary: true,
  overspeedReport: true,
  deviceMetadata: true,
  trips: false,
  geofences: false,
  alerts: false,
  immobilize: false,
};

/**
 * Live GPS adapter — transport + mapping only. Does not ingest or change staff read APIs.
 */
export class LiveGpsAdapter implements GpsProviderAdapter {
  readonly providerKey = LIVE_GPS_PROVIDER_KEY;
  readonly displayName = "Live GPS";
  readonly staticCapabilities = LIVE_GPS_CAPABILITIES;
  readonly supportsFleetSync = true;

  private readonly clientOptions: LiveGpsClientOptions;

  constructor(clientOptions: LiveGpsClientOptions = {}) {
    this.clientOptions = clientOptions;
  }

  createClient() {
    return createLiveGpsClient(this.clientOptions);
  }

  async fetchFleetSnapshot(
    ctx: GpsProviderFleetFetchContext,
    runtime: GpsProviderSyncRuntime,
  ): Promise<ProviderFleetFetchResult> {
    const username = ctx.credentials.username?.trim();
    const password = ctx.credentials.password?.trim();
    if (!username || !password) throw gpsProviderNotConfiguredError();
    const client = createLiveGpsClient({
      ...this.clientOptions,
      sessionManager: runtime.liveGpsSessionManager,
    });
    const liveCtx: LiveGpsClientContext = {
      providerAccountId: ctx.providerAccountId,
      secrets: { username, password },
      config: ctx.config,
    };
    return client.fetchFleetSnapshot(liveCtx);
  }

  /** Manual/PoC helpers — not used by automatic sync. */
  async fetchFleetSnapshotLiveCtx(ctx: LiveGpsClientContext): Promise<ProviderFleetFetchResult> {
    return this.createClient().fetchFleetSnapshot(ctx);
  }

  async fetchDeviceList(ctx: LiveGpsClientContext): Promise<unknown[]> {
    return this.createClient().fetchDeviceListRaw(ctx);
  }

  async fetchHistory(
    ctx: GpsProviderHistoryFetchContext,
    runtime: GpsProviderRuntime,
  ): Promise<ProviderHistoryFetchResult> {
    const username = ctx.credentials.username?.trim();
    const password = ctx.credentials.password?.trim();
    if (!username || !password) throw gpsProviderNotConfiguredError();
    const timezoneOffset = resolveLiveGpsTimezoneOffset(ctx.config);
    const startDate = formatLiveGpsLocalDateTime(ctx.from, timezoneOffset);
    const endDate = formatLiveGpsLocalDateTime(ctx.to, timezoneOffset);
    if (!startDate || !endDate) throw gpsProviderInvalidResponseError();

    const client = createLiveGpsClient({
      ...this.clientOptions,
      sessionManager: runtime.liveGpsSessionManager,
    });
    return client.fetchHistory({
      ctx: {
        providerAccountId: ctx.providerAccountId,
        secrets: { username, password },
        config: ctx.config,
      },
      deviceId: ctx.externalDeviceId,
      startDate,
      endDate,
      timezoneOffset,
    });
  }

  async fetchMileageSummary(
    ctx: GpsProviderReportContext,
    runtime: GpsProviderRuntime,
  ): Promise<ProviderMileageSummary> {
    const client = createLiveGpsClient({
      ...this.clientOptions,
      sessionManager: runtime.liveGpsSessionManager,
    });
    return client.fetchMileageSummary({
      ctx: {
        providerAccountId: ctx.providerAccountId,
        secrets: { username: ctx.credentials.username!, password: ctx.credentials.password! },
        config: ctx.config,
      },
      deviceId: ctx.externalDeviceId,
    });
  }

  async fetchOverspeed(
    ctx: GpsProviderReportContext & { date: string; thresholdKph: number },
    runtime: GpsProviderRuntime,
  ): Promise<ProviderOverspeedFetchResult> {
    const client = createLiveGpsClient({
      ...this.clientOptions,
      sessionManager: runtime.liveGpsSessionManager,
    });
    return client.fetchOverspeed({
      ctx: {
        providerAccountId: ctx.providerAccountId,
        secrets: { username: ctx.credentials.username!, password: ctx.credentials.password! },
        config: ctx.config,
      },
      deviceId: ctx.externalDeviceId,
      date: ctx.date,
      thresholdKph: ctx.thresholdKph,
      timezoneOffset: resolveLiveGpsTimezoneOffset(ctx.config),
    });
  }

  async fetchDeviceMetadata(
    ctx: GpsProviderMetadataFetchContext,
    runtime: GpsProviderRuntime,
  ): Promise<ProviderDeviceModelResult> {
    const username = ctx.credentials.username?.trim();
    const password = ctx.credentials.password?.trim();
    if (!username || !password) throw gpsProviderNotConfiguredError();
    const client = createLiveGpsClient({
      ...this.clientOptions,
      sessionManager: runtime.liveGpsSessionManager,
    });
    return client.fetchDeviceMetadata({
      ctx: {
        providerAccountId: ctx.providerAccountId,
        secrets: { username, password },
        config: ctx.config,
      },
      deviceId: ctx.externalDeviceId,
    });
  }

  /** Manual/PoC helper — not used by automatic sync or staff routes. */
  async fetchHistoryLiveCtx(
    ctx: LiveGpsClientContext,
    input: { deviceId: string; startDate: string; endDate: string },
  ): Promise<ProviderHistoryFetchResult> {
    return this.createClient().fetchHistory({ ctx, ...input });
  }
}
