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
  mappingIncomplete: (operationType: TarsOperationTypeKey, missing: string[]) =>
    err(
      ErrorCode.CONFLICT,
      "Diamond data required for this TARS operation is incomplete",
      "TARS_MAPPING_INCOMPLETE",
      { operationType, missing },
    ),
  providerError: (operationType: TarsOperationTypeKey) =>
    err(ErrorCode.CONFLICT, "The TARS provider rejected the operation", "TARS_PROVIDER_ERROR", {
      operationType,
    }),
  contractNotFound: () => AppError.notFound("Contract not found"),
  otpNotRequested: () =>
    err(ErrorCode.CONFLICT, "No active TARS OTP challenge", "TARS_OTP_NOT_REQUESTED"),
  otpExpired: () =>
    err(ErrorCode.CONFLICT, "TARS OTP challenge has expired", "TARS_OTP_EXPIRED"),
  otpAttemptsExceeded: () =>
    err(
      ErrorCode.CONFLICT,
      "Too many TARS OTP verification attempts",
      "TARS_OTP_ATTEMPTS_EXCEEDED",
    ),
  otpResendCooldown: () =>
    err(ErrorCode.CONFLICT, "TARS OTP resend is not available yet", "TARS_OTP_RESEND_COOLDOWN"),
  otpVerificationRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "TARS identity verification is required before signing",
      "TARS_OTP_VERIFICATION_REQUIRED",
    ),
  invalidOtpCode: () =>
    err(ErrorCode.CONFLICT, "TARS OTP verification failed", "TARS_OTP_INVALID"),
  otpRequestFailed: (errorCode?: string) =>
    err(ErrorCode.CONFLICT, "TARS OTP could not be sent", "TARS_OTP_REQUEST_FAILED", {
      providerError: errorCode,
    }),
  providerCompanyMismatch: () =>
    err(
      ErrorCode.CONFLICT,
      "TARS provider does not match contract company",
      "TARS_PROVIDER_COMPANY_MISMATCH",
    ),
  externalIdCompanyMismatch: () =>
    err(
      ErrorCode.CONFLICT,
      "TARS external identifier belongs to a different provider",
      "TARS_EXTERNAL_ID_COMPANY_MISMATCH",
    ),
};

export const TARS_ERROR_REASONS = {
  NOT_CONFIGURED: "TARS_NOT_CONFIGURED",
  OPERATION_IN_PROGRESS: "TARS_OPERATION_IN_PROGRESS",
  OPERATION_ALREADY_COMPLETED: "TARS_OPERATION_ALREADY_COMPLETED",
  MAPPING_INCOMPLETE: "TARS_MAPPING_INCOMPLETE",
  PROVIDER_ERROR: "TARS_PROVIDER_ERROR",
  OTP_NOT_REQUESTED: "TARS_OTP_NOT_REQUESTED",
  OTP_EXPIRED: "TARS_OTP_EXPIRED",
  OTP_ATTEMPTS_EXCEEDED: "TARS_OTP_ATTEMPTS_EXCEEDED",
  OTP_RESEND_COOLDOWN: "TARS_OTP_RESEND_COOLDOWN",
  OTP_VERIFICATION_REQUIRED: "TARS_OTP_VERIFICATION_REQUIRED",
  OTP_INVALID: "TARS_OTP_INVALID",
  PROVIDER_COMPANY_MISMATCH: "TARS_PROVIDER_COMPANY_MISMATCH",
  EXTERNAL_ID_COMPANY_MISMATCH: "TARS_EXTERNAL_ID_COMPANY_MISMATCH",
} as const;
