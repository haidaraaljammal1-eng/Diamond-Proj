import type { GpsProviderRuntime } from "src/modules/gps/gps-provider.types";

export function createGpsProviderRuntime(
  sessionManagers: ReadonlyMap<string, unknown>,
): GpsProviderRuntime {
  return {
    getSessionManager<T>(providerKey: string): T {
      const manager = sessionManagers.get(providerKey);
      if (!manager) {
        throw new Error(`GPS session manager is not configured for provider ${providerKey}`);
      }
      return manager as T;
    },
  };
}
