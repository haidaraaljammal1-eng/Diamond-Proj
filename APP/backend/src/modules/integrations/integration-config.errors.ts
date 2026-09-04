import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/** Stable, machine-readable reasons for dynamic integration config errors. */
export const IntegrationConfigErrorReason = {
  INTEGRATION_KIND_UNKNOWN: "integration_kind_unknown",
  INTEGRATION_CONFIG_INVALID: "integration_config_invalid",
} as const;
export type IntegrationConfigErrorReason =
  (typeof IntegrationConfigErrorReason)[keyof typeof IntegrationConfigErrorReason];

const R = IntegrationConfigErrorReason;

export function unknownIntegrationKind(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Unknown integration",
    context: { reason: R.INTEGRATION_KIND_UNKNOWN },
  });
}

export function integrationConfigInvalid(detail: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: detail,
    context: { reason: R.INTEGRATION_CONFIG_INVALID, detail },
  });
}
