import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import type { TarsOperationTypeKey } from "src/modules/integrations/tars/tars.constants";

function err(
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
  reason: string,
  extra?: Record<string, unknown>,
): AppError {
  return new AppError({ code, message, context: { reason, ...extra } });
}

/**
 * Stable TARS integration errors. Vendor-specific TARS error codes are NOT
 * modelled here: until official documentation exists, every provider failure
 * collapses to TARS_PROVIDER_ERROR.
 */
export const tarsError = {
  notConfigured: () =>
    err(ErrorCode.CONFLICT, "TARS integration is not configured", "TARS_NOT_CONFIGURED"),
  operationInProgress: (operationType: TarsOperationTypeKey) =>
    err(
      ErrorCode.CONFLICT,
      "A TARS operation of this type is already in progress",
      "TARS_OPERATION_IN_PROGRESS",
      { operationType },
    ),
  operationAlreadyCompleted: (operationType: TarsOperationTypeKey) =>
    err(
      ErrorCode.CONFLICT,
      "This TARS operation has already succeeded",
      "TARS_OPERATION_ALREADY_COMPLETED",
      { operationType },
    ),
  /** `missing` lists Diamond field paths, never their values. */
  mappingIncomplete: (operationType: TarsOperationTypeKey, missing: string[]) =>
    err(
      ErrorCode.CONFLICT,
      "Diamond data required for this TARS operation is incomplete",
      "TARS_MAPPING_INCOMPLETE",
      { operationType, missing },
    ),
  /** Generic future-provider failure. Never carries a raw vendor body. */
  providerError: (operationType: TarsOperationTypeKey) =>
    err(ErrorCode.CONFLICT, "The TARS provider rejected the operation", "TARS_PROVIDER_ERROR", {
      operationType,
    }),
  contractNotFound: () => AppError.notFound("Contract not found"),
};

export const TARS_ERROR_REASONS = {
  NOT_CONFIGURED: "TARS_NOT_CONFIGURED",
  OPERATION_IN_PROGRESS: "TARS_OPERATION_IN_PROGRESS",
  OPERATION_ALREADY_COMPLETED: "TARS_OPERATION_ALREADY_COMPLETED",
  MAPPING_INCOMPLETE: "TARS_MAPPING_INCOMPLETE",
  PROVIDER_ERROR: "TARS_PROVIDER_ERROR",
} as const;
