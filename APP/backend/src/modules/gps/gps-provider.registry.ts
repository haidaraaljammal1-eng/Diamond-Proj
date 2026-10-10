import type { GpsProviderAdapter, GpsProviderKey } from "src/modules/gps/gps-provider.adapter";
import { GpsUnconfiguredAdapter } from "src/modules/gps/providers/gps-unconfigured.adapter";
import { LiveGpsAdapter } from "src/modules/gps/providers/live-gps/live-gps.adapter";

const adapters: GpsProviderAdapter[] = [new LiveGpsAdapter(), new GpsUnconfiguredAdapter()];

const byKey = new Map<GpsProviderKey, GpsProviderAdapter>(
  adapters.map((adapter) => [adapter.providerKey, adapter]),
);
const testOverrides = new Map<string, GpsProviderAdapter | null>();

export function getGpsProviderAdapter(providerKey: GpsProviderKey): GpsProviderAdapter | null {
  if (testOverrides.has(providerKey)) return testOverrides.get(providerKey) ?? null;
  return byKey.get(providerKey) ?? null;
}

export function listGpsProviderAdapters(): readonly GpsProviderAdapter[] {
  return adapters.filter((a) => a.providerKey !== "none");
}

/** Test-only adapter injection; production code never registers overrides. */
export function setGpsProviderAdapterForTests(
  providerKey: string,
  adapter: GpsProviderAdapter | null,
): void {
  testOverrides.set(providerKey, adapter);
}

export function clearGpsProviderAdapterTestOverrides(): void {
  testOverrides.clear();
}
