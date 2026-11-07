/**
 * Counts for the unified Daily Operations & Receivables Pushover digest.
 * Counts only — no customer/vehicle/contract identifiers in the scheduled message.
 */
export interface DailyOperationsDigestSnapshot {
  unpaidRentalsCount: number;
  unpaidRenewalsCount: number;
  trafficViolationsCount: number;
  salikCount: number;
  reconciliationCount: number;
  postCloseReceivablesCount: number;
  overdueVehicleReturnsCount: number;
  scheduledMaintenanceNotStartedCount: number;
  maintenanceCompletionDelayedCount: number;
}

export function dailyOperationsDigestTotal(snapshot: DailyOperationsDigestSnapshot): number {
  return (
    snapshot.unpaidRentalsCount +
    snapshot.unpaidRenewalsCount +
    snapshot.trafficViolationsCount +
    snapshot.salikCount +
    snapshot.reconciliationCount +
    snapshot.postCloseReceivablesCount +
    snapshot.overdueVehicleReturnsCount +
    snapshot.scheduledMaintenanceNotStartedCount +
    snapshot.maintenanceCompletionDelayedCount
  );
}

export function dailyOperationsDigestHasOutstanding(
  snapshot: DailyOperationsDigestSnapshot,
): boolean {
  return dailyOperationsDigestTotal(snapshot) > 0;
}
