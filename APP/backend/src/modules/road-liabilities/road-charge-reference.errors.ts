import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";

export const RoadChargeReferenceReason = {
  ALREADY_USED: "REFERENCE_ALREADY_USED",
  IN_PROGRESS: "REFERENCE_IN_PROGRESS",
  REGISTRY_SCHEMA_OUTDATED: "REFERENCE_REGISTRY_SCHEMA_OUTDATED",
} as const;

export function roadChargeReferenceAlreadyUsedError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Reference number is already used for this charge category",
    context: { reason: RoadChargeReferenceReason.ALREADY_USED },
  });
}

export function roadChargeReferenceInProgressError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Reference number has a collection already in progress",
    context: { reason: RoadChargeReferenceReason.IN_PROGRESS },
  });
}

export function roadChargeReferenceRegistrySchemaOutdatedError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Reference registry database migration is not applied",
    context: { reason: RoadChargeReferenceReason.REGISTRY_SCHEMA_OUTDATED },
  });
}
