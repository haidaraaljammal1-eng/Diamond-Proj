import { getGpsProviderAdapter } from "src/modules/gps/gps-provider.registry";

/**
 * Diamond GPS provider account semantics (Phase 1.1).
 *
 * CONFIGURED — local prerequisites to *attempt* provider use (adapter + credentials).
 * ENABLED — persisted switch: background sync may run for this account.
 * HEALTH — derived runtime outcome of provider communication (not persisted as enum).
 *
 * These must never collapse: configured ≠ enabled ≠ healthy.
 */

export type GpsProviderAccountHealth =
  | "NOT_CONFIGURED"
  | "DISABLED"
  | "CONNECTED"
  | "AUTH_FAILED"
  | "SYNC_ERROR"
  | "STALE";

export type GpsProviderAccountFacts = {
  providerKey: string;
  enabled: boolean;
  secretEncrypted: string | null;
  lastSuccessfulSyncAt: Date | null;
  lastFailureCode: string | null;
};

/** Registry has a non-placeholder adapter for this provider key. */
export function isGpsProviderKeySupported(providerKey: string): boolean {
  const adapter = getGpsProviderAdapter(providerKey);
  return adapter != null && adapter.providerKey !== "none";
}

/**
 * Local configuration sufficient to attempt sync later (not auth success, not reachability).
 */
export function isGpsProviderAccountLocallyConfigured(account: GpsProviderAccountFacts): boolean {
  if (!isGpsProviderKeySupported(account.providerKey)) return false;
  return Boolean(account.secretEncrypted?.trim());
}

/** Persisted runtime switch — automatic synchronization is allowed when true. */
export function isGpsProviderAccountSyncEnabled(account: { enabled: boolean }): boolean {
  return account.enabled;
}

/**
 * Derives health from persisted facts only — no network I/O, no fake CONNECTED.
 * Returns null when enabled+configured but sync/health wiring is not evaluating yet.
 */
export function deriveGpsProviderAccountHealth(
  account: GpsProviderAccountFacts,
): GpsProviderAccountHealth | null {
  if (!isGpsProviderAccountLocallyConfigured(account)) return "NOT_CONFIGURED";
  if (!isGpsProviderAccountSyncEnabled(account)) return "DISABLED";
  // Phase 3+ maps lastFailureCode / lastSuccessfulSyncAt / live session to CONNECTED, STALE, etc.
  return null;
}
