/**
 * Lets non-React code (e.g. Zustand stores) request a NextAuth session refresh so
 * JWT permissions re-sync from GET /auth/me without a full re-login.
 */
let syncHandler: (() => void) | null = null;
/** Dev/diagnostic: last `requestSessionPermissionSync()` timestamp (ms). */
let lastSessionPermissionSyncAt = 0;

export function getLastSessionPermissionSyncAt(): number {
  return lastSessionPermissionSyncAt;
}

export function registerSessionPermissionSyncHandler(handler: () => void): () => void {
  syncHandler = handler;
  return () => {
    if (syncHandler === handler) syncHandler = null;
  };
}

export function requestSessionPermissionSync(): void {
  lastSessionPermissionSyncAt = Date.now();
  syncHandler?.();
}
