import {
  TARS_NOT_STARTED,
  TARS_OPERATION_TYPES,
  TARS_PROJECTION_KEYS,
  TARS_REPEATABLE_OPERATION_TYPES,
  type TarsOperationStatusKey,
  type TarsOperationTypeKey,
  type TarsProjectionKey,
  type TarsProjectionStatus,
} from "src/modules/integrations/tars/tars.constants";

export interface TarsContractIntegrationState {
  configured: boolean;
  company: { id: number; code: string; displayName: string; accentColor: string };
  externalContractId: string | null;
  externalRentalDid: string | null;
  lastSuccessfulSyncAt: Date | null;
  operations: Record<TarsProjectionKey, TarsProjectionStatus>;
}

export interface TarsProjectionOperationRow {
  operationType: TarsOperationTypeKey;
  status: string;
  correlationSubject: string | null;
  createdAt: Date;
}

export interface TarsProjectionInput {
  configured: boolean;
  company: { id: number; code: string; displayName: string; accentColor: string };
  integration: {
    externalContractId: string | null;
    externalRentalDid: string | null;
    lastSuccessfulSyncAt: Date | null;
  } | null;
  operations: TarsProjectionOperationRow[];
}

/** Map legacy DB statuses to staff-facing projection vocabulary. */
export function normalizeOperationStatus(status: string): TarsProjectionStatus {
  if (status === "PENDING" || status === "PROCESSING") return "SUBMITTING";
  if (
    status === "SUBMITTING" ||
    status === "PENDING_PROVIDER" ||
    status === "SUCCEEDED" ||
    status === "FAILED"
  ) {
    return status as TarsProjectionStatus;
  }
  return TARS_NOT_STARTED;
}

/**
 * For repeatable operations, the latest SUCCEEDED row per correlationSubject
 * wins; for non-repeatable types any SUCCEEDED attempt marks the capability done.
 */
export function toTarsContractIntegrationState(
  input: TarsProjectionInput,
): TarsContractIntegrationState {
  const byType = new Map<TarsOperationTypeKey, TarsProjectionStatus>();
  const succeededSubjects = new Map<TarsOperationTypeKey, Set<string>>();

  for (const row of [...input.operations].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    const normalized = normalizeOperationStatus(row.status);
    if (normalized === "SUCCEEDED" && row.correlationSubject) {
      const set = succeededSubjects.get(row.operationType) ?? new Set<string>();
      set.add(row.correlationSubject);
      succeededSubjects.set(row.operationType, set);
    }
    if (TARS_REPEATABLE_OPERATION_TYPES.has(row.operationType)) {
      byType.set(row.operationType, normalized);
      continue;
    }
    if (byType.get(row.operationType) === "SUCCEEDED") continue;
    byType.set(row.operationType, normalized);
  }

  const operations = {} as Record<TarsProjectionKey, TarsProjectionStatus>;
  for (const operationType of TARS_OPERATION_TYPES) {
    operations[TARS_PROJECTION_KEYS[operationType]] =
      byType.get(operationType) ?? TARS_NOT_STARTED;
  }

  return {
    configured: input.configured,
    company: input.company,
    externalContractId: input.integration?.externalContractId ?? null,
    externalRentalDid: input.integration?.externalRentalDid ?? null,
    lastSuccessfulSyncAt: input.integration?.lastSuccessfulSyncAt ?? null,
    operations,
  };
}

export function isOperationInFlight(status: TarsOperationStatusKey | string): boolean {
  const normalized = normalizeOperationStatus(status);
  return normalized === "SUBMITTING" || normalized === "PENDING_PROVIDER";
}
