/**
 * TARS integration constants. These are DIAMOND capability names, not TARS API
 * endpoint names — official TARS documentation does not exist yet.
 */

/** The five mandatory TARS procedures in scope. Nothing else is integrated. */
export const TARS_OPERATION_TYPES = [
  "REGISTER_CONTRACT",
  "CONTRACT_ACCEPTANCE",
  "HANDOVER",
  "RETURN_DOCUMENTATION",
  "COMPLETE_CONTRACT",
] as const;
export type TarsOperationTypeKey = (typeof TARS_OPERATION_TYPES)[number];

export const TARS_OPERATION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
] as const;
export type TarsOperationStatusKey = (typeof TARS_OPERATION_STATUSES)[number];

/** A contract with no attempt of a given type reports this in projections. */
export const TARS_NOT_STARTED = "NOT_STARTED" as const;

export const TARS_PROJECTION_STATUSES = [
  TARS_NOT_STARTED,
  ...TARS_OPERATION_STATUSES,
] as const;
export type TarsProjectionStatus = (typeof TARS_PROJECTION_STATUSES)[number];

/**
 * Advisory-lock namespace serializing attempts of the same operation type on
 * the same Contract, so two callers can never both hold PROCESSING.
 */
export const TARS_OPERATION_LOCK_NS = "tars_operation";

/** Idempotency scope prefix; the full scope is `${prefix}:${contractId}:${type}`. */
export const TARS_IDEMPOTENCY_SCOPE = "tars:operation";

/** Frontend-facing projection key per operation type. */
export const TARS_PROJECTION_KEYS = {
  REGISTER_CONTRACT: "registerContract",
  CONTRACT_ACCEPTANCE: "contractAcceptance",
  HANDOVER: "handover",
  RETURN_DOCUMENTATION: "returnDocumentation",
  COMPLETE_CONTRACT: "completeContract",
} as const satisfies Record<TarsOperationTypeKey, string>;

export type TarsProjectionKey =
  (typeof TARS_PROJECTION_KEYS)[TarsOperationTypeKey];
