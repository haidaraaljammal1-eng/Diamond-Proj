export interface ArchiveSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  affectedContracts: number;
  violationsCounted: number;
  syncStartedAt: string;
  lastSuccessfulSyncAt: string | null;
  errors?: Array<{ contractId: string; message: string }>;
}

export interface ArchiveSyncStatus {
  lastSuccessfulSyncAt: string | null;
  running: boolean;
  runningStartedAt: string | null;
}
