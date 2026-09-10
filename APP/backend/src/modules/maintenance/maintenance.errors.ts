import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const MaintenanceErrorReason = {
  MAINTENANCE_NOT_FOUND: "MAINTENANCE_NOT_FOUND",
  VEHICLE_NOT_FOUND: "VEHICLE_NOT_FOUND",
  VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE: "VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE",
  ACTIVE_MAINTENANCE_EXISTS: "ACTIVE_MAINTENANCE_EXISTS",
  INVALID_TRANSITION: "MAINTENANCE_INVALID_TRANSITION",
  SCHEDULED_AT_REQUIRED: "MAINTENANCE_SCHEDULED_AT_REQUIRED",
  SCHEDULED_AT_MUST_BE_FUTURE: "MAINTENANCE_SCHEDULED_AT_MUST_BE_FUTURE",
  MAINTENANCE_COMPLETED_IMMUTABLE: "MAINTENANCE_COMPLETED_IMMUTABLE",
  VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS: "VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS",
} as const;

const R = MaintenanceErrorReason;

export function maintenanceNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Maintenance order not found",
    context: { reason: R.MAINTENANCE_NOT_FOUND },
  });
}

export function vehicleNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Vehicle not found",
    context: { reason: R.VEHICLE_NOT_FOUND },
  });
}

export function vehicleNotAvailableForMaintenanceError(
  detail?: string,
): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Vehicle is not available for maintenance",
    context: {
      reason: R.VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE,
      ...(detail ? { detail } : {}),
    },
    conflicts: [
      {
        resource: "vehicle",
        field: "operationalStatus",
        message: "Vehicle is not available for maintenance",
      },
    ],
  });
}

export function activeMaintenanceExistsError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This vehicle already has an active maintenance order",
    context: { reason: R.ACTIVE_MAINTENANCE_EXISTS },
    conflicts: [
      {
        resource: "maintenance",
        field: "vehicleId",
        message: "Active maintenance order already exists for this vehicle",
      },
    ],
  });
}

export function invalidMaintenanceTransitionError(
  from: string,
  to: string,
): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Maintenance status transition is not allowed",
    context: { reason: R.INVALID_TRANSITION, from, to },
  });
}

export function scheduledAtRequiredError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Scheduled date is required when scheduling maintenance",
    context: { reason: R.SCHEDULED_AT_REQUIRED },
  });
}

export function scheduledAtMustBeFutureError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Scheduled date must be in the future",
    context: { reason: R.SCHEDULED_AT_MUST_BE_FUTURE },
  });
}

export function maintenanceCompletedImmutableError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Completed maintenance orders cannot be edited",
    context: { reason: R.MAINTENANCE_COMPLETED_IMMUTABLE },
  });
}

export function vehicleActiveMaintenanceBlocksStatusError(
  detail?: string,
): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Vehicle operational status cannot change while maintenance is active",
    context: {
      reason: R.VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS,
      ...(detail ? { detail } : {}),
    },
    conflicts: [
      {
        resource: "vehicle",
        field: "operationalStatus",
        message: "Active maintenance order blocks this status change",
      },
    ],
  });
}
