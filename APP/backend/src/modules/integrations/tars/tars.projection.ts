import {
  TARS_NOT_STARTED,
  TARS_OPERATION_TYPES,
  TARS_PROJECTION_KEYS,
  type TarsOperationStatusKey,
  type TarsOperationTypeKey,
  type TarsProjectionKey,
  type TarsProjectionStatus,
} from "src/modules/integrations/tars/tars.constants";

/**
 * Safe staff read projection. It exposes integration STATE only: no request or
 * response payload, no provider credentials and no customer PII.
 */
export interface TarsContractIntegrationState {
  /** False until a real, credentialed TARS provider exists. */
  configured: boolean;
  externalContractId: string | null;
  lastSuccessfulSyncAt: Date | null;
  operations: Record<TarsProjectionKey, TarsProjectionStatus>;
}

export interface TarsProjectionOperationRow {
  operationType: TarsOperationTypeKey;
  status: TarsOperationStatusKey;
  createdAt: Date;
}

export interface TarsProjectionInput {
  configured: boolean;
  integration: {
    externalContractId: string | null;
    lastSuccessfulSyncAt: Date | null;
  } | null;
  operations: TarsProjectionOperationRow[];
}

/**
 * A missing operation projects as NOT_STARTED — placeholder rows are never
 * written just to render a status. An authoritative SUCCEEDED attempt wins over
 * a later attempt of the same type, so retry history cannot make a completed
 * mandatory procedure look unfinished.
 */
export function toTarsContractIntegrationState(
  input: TarsProjectionInput,
): TarsContractIntegrationState {
  const byType = new Map<TarsOperationTypeKey, TarsProjectionStatus>();

  for (const row of [...input.operations].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    if (byType.get(row.operationType) === "SUCCEEDED") continue;
    byType.set(row.operationType, row.status);
  }

  const operations = {} as Record<TarsProjectionKey, TarsProjectionStatus>;
  for (const operationType of TARS_OPERATION_TYPES) {
    operations[TARS_PROJECTION_KEYS[operationType]] =
      byType.get(operationType) ?? TARS_NOT_STARTED;
  }

  return {
    configured: input.configured,
    externalContractId: input.integration?.externalContractId ?? null,
    lastSuccessfulSyncAt: input.integration?.lastSuccessfulSyncAt ?? null,
    operations,
  };
}
