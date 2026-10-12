import { LiveGpsSessionManager } from "src/modules/gps/providers/live-gps/live-gps.session";
import { LIVE_GPS_PROVIDER_KEY } from "src/modules/gps/providers/live-gps/live-gps.constants";
import { createGpsProviderRuntime } from "src/modules/gps/gps-provider-runtime";
import type { GpsProviderRuntime } from "src/modules/gps/gps-provider.types";
import { SevenStarsSessionManager } from "src/modules/gps/providers/seven-stars/seven-stars.session";
import { SEVEN_STARS_PROVIDER_KEY } from "src/modules/gps/providers/seven-stars/seven-stars.constants";

let shared: LiveGpsSessionManager | undefined;
let sharedSevenStars: SevenStarsSessionManager | undefined;
let sharedRuntime: GpsProviderRuntime | undefined;

/** One in-process session manager for all Live GPS accounts (keyed by providerAccountId). */
export function getSharedLiveGpsSessionManager(): LiveGpsSessionManager {
  if (!shared) shared = new LiveGpsSessionManager();
  return shared;
}

export function getSharedSevenStarsSessionManager(): SevenStarsSessionManager {
  if (!sharedSevenStars) sharedSevenStars = new SevenStarsSessionManager();
  return sharedSevenStars;
}

/** Shared provider composition; session state remains owned by each provider manager. */
export function getSharedGpsProviderRuntime(): GpsProviderRuntime {
  if (!sharedRuntime) {
    const managers = new Map<string, unknown>();
    managers.set(LIVE_GPS_PROVIDER_KEY, getSharedLiveGpsSessionManager());
    managers.set(SEVEN_STARS_PROVIDER_KEY, getSharedSevenStarsSessionManager());
    sharedRuntime = createGpsProviderRuntime(managers);
  }
  return sharedRuntime;
}

export function resetSharedLiveGpsSessionManagerForTests(): void {
  shared = undefined;
  sharedSevenStars = undefined;
  sharedRuntime = undefined;
}
