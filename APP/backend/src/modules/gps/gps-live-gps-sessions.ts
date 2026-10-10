import { LiveGpsSessionManager } from "src/modules/gps/providers/live-gps/live-gps.session";

let shared: LiveGpsSessionManager | undefined;

/** One in-process session manager for all Live GPS accounts (keyed by providerAccountId). */
export function getSharedLiveGpsSessionManager(): LiveGpsSessionManager {
  if (!shared) shared = new LiveGpsSessionManager();
  return shared;
}

export function resetSharedLiveGpsSessionManagerForTests(): void {
  shared = undefined;
}
