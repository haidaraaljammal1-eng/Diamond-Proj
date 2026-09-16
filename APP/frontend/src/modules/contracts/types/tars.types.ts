/**
 * Read-only TARS integration state for one Contract.
 *
 * Mirrors the Backend staff projection (`GET /contracts/:id/tars`). Diamond
 * never executes a TARS operation from the frontend, so there is no payload,
 * no command and no retry shape here — only what the employee is shown.
 */

export type TarsOperationStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

/** The five approved mandatory procedures, keyed as the Backend projects them. */
export type TarsOperationKey =
  | "registerContract"
  | "contractAcceptance"
  | "handover"
  | "returnDocumentation"
  | "completeContract";

export interface ContractTarsStateDto {
  /** False until a real, credentialed TARS provider exists. Not an error. */
  configured: boolean;
  externalContractId: string | null;
  lastSuccessfulSyncAt: string | null;
  operations: Record<TarsOperationKey, TarsOperationStatus>;
}

export interface ContractTarsResponseDto {
  tars: ContractTarsStateDto;
}
