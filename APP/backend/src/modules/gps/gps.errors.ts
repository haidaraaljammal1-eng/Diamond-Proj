import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const GpsErrorReason = {
  VEHICLE_NOT_FOUND: "GPS_VEHICLE_NOT_FOUND",
  BINDING_REQUIRED: "GPS_BINDING_REQUIRED",
  INVALID_COORDINATES: "GPS_INVALID_COORDINATES",
  INVALID_SPEED: "GPS_INVALID_SPEED",
  INVALID_HEADING: "GPS_INVALID_HEADING",
  INVALID_ACCURACY: "GPS_INVALID_ACCURACY",
  NOT_CONFIGURED: "GPS_NOT_CONFIGURED",
} as const;

const R = GpsErrorReason;

export function gpsVehicleNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Vehicle not found",
    context: { reason: R.VEHICLE_NOT_FOUND },
  });
}

export function gpsBindingRequiredError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Vehicle has no active GPS binding",
    context: { reason: R.BINDING_REQUIRED },
  });
}

/** Validation errors must not include the rejected coordinate values. */
export function gpsInvalidCoordinatesError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS coordinates are invalid",
    context: { reason: R.INVALID_COORDINATES },
  });
}

export function gpsInvalidSpeedError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS speed is invalid",
    context: { reason: R.INVALID_SPEED },
  });
}

export function gpsInvalidHeadingError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS heading is invalid",
    context: { reason: R.INVALID_HEADING },
  });
}

export function gpsInvalidAccuracyError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS accuracy is invalid",
    context: { reason: R.INVALID_ACCURACY },
  });
}

/**
 * Reserved for a future synchronization/management action. Ordinary GPS read
 * APIs must not throw this — they return NOT_CONFIGURED projections instead.
 */
export function gpsNotConfiguredError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS provider is not configured",
    context: { reason: R.NOT_CONFIGURED },
  });
}
