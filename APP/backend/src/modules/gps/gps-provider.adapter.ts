import type { GpsProviderCapabilities } from "src/modules/gps/gps-provider.capabilities";
import type {
  GpsProviderFleetFetchContext,
  GpsProviderHistoryFetchContext,
  GpsProviderRuntime,
  GpsProviderSyncRuntime,
  ProviderFleetFetchResult,
  ProviderHistoryFetchResult,
  GpsProviderReportContext,
  ProviderMileageSummary,
  ProviderOverspeedFetchResult,
  ProviderDeviceModelResult,
  GpsProviderMetadataFetchContext,
} from "src/modules/gps/gps-provider.types";

/** Registry key for a GPS vendor integration (e.g. LIVE_GPS). */
export type GpsProviderKey = string;

export interface GpsProviderAdapter {
  readonly providerKey: GpsProviderKey;
  readonly displayName: string;
  readonly staticCapabilities: GpsProviderCapabilities;
  readonly supportsFleetSync: boolean;
  fetchFleetSnapshot?(
    ctx: GpsProviderFleetFetchContext,
    runtime: GpsProviderSyncRuntime,
  ): Promise<ProviderFleetFetchResult>;
  fetchHistory?(
    ctx: GpsProviderHistoryFetchContext,
    runtime: GpsProviderRuntime,
  ): Promise<ProviderHistoryFetchResult>;
  fetchMileageSummary?(
    ctx: GpsProviderReportContext,
    runtime: GpsProviderRuntime,
  ): Promise<ProviderMileageSummary>;
  fetchOverspeed?(
    ctx: GpsProviderReportContext & { date: string; thresholdKph: number },
    runtime: GpsProviderRuntime,
  ): Promise<ProviderOverspeedFetchResult>;
  fetchDeviceMetadata?(
    ctx: GpsProviderMetadataFetchContext,
    runtime: GpsProviderRuntime,
  ): Promise<ProviderDeviceModelResult>;
}
