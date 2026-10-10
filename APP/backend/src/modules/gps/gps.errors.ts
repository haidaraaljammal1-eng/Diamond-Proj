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
  PROVIDER_ACCOUNT_NOT_FOUND: "GPS_PROVIDER_ACCOUNT_NOT_FOUND",
  PROVIDER_ACCOUNT_DISABLED: "GPS_PROVIDER_ACCOUNT_DISABLED",
  COMPANY_SCOPE_VIOLATION: "GPS_COMPANY_SCOPE_VIOLATION",
  DEVICE_ALREADY_BOUND: "GPS_DEVICE_ALREADY_BOUND",
  PROVIDER_EXTRAS_INVALID: "GPS_PROVIDER_EXTRAS_INVALID",
  PROVIDER_NOT_CONFIGURED: "GPS_PROVIDER_NOT_CONFIGURED",
  PROVIDER_AUTH_FAILED: "GPS_PROVIDER_AUTH_FAILED",
  PROVIDER_SESSION_EXPIRED: "GPS_PROVIDER_SESSION_EXPIRED",
  PROVIDER_TIMEOUT: "GPS_PROVIDER_TIMEOUT",
  PROVIDER_CONNECTION_FAILED: "GPS_PROVIDER_CONNECTION_FAILED",
  PROVIDER_INVALID_RESPONSE: "GPS_PROVIDER_INVALID_RESPONSE",
  PROVIDER_REMOTE_ERROR: "GPS_PROVIDER_REMOTE_ERROR",
  BINDING_NOT_FOUND: "GPS_BINDING_NOT_FOUND",
  HISTORY_UNSUPPORTED: "GPS_HISTORY_UNSUPPORTED",
  HISTORY_INVALID_RANGE: "GPS_HISTORY_INVALID_RANGE",
  HISTORY_RANGE_TOO_LARGE: "GPS_HISTORY_RANGE_TOO_LARGE",
  HISTORY_RESULT_TOO_LARGE: "GPS_HISTORY_RESULT_TOO_LARGE",
  MILEAGE_UNSUPPORTED: "GPS_MILEAGE_UNSUPPORTED",
  OVERSPEED_UNSUPPORTED: "GPS_OVERSPEED_UNSUPPORTED",
  OVERSPEED_INVALID_THRESHOLD: "GPS_OVERSPEED_INVALID_THRESHOLD",
  DEVICE_METADATA_UNSUPPORTED: "GPS_DEVICE_METADATA_UNSUPPORTED",
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

export function gpsBindingNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Vehicle has no active GPS binding",
    context: { reason: R.BINDING_NOT_FOUND },
  });
}

export function gpsHistoryUnsupportedError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS history is not supported for this provider",
    context: { reason: R.HISTORY_UNSUPPORTED },
  });
}

export function gpsHistoryInvalidRangeError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS history range is invalid",
    context: { reason: R.HISTORY_INVALID_RANGE },
  });
}

export function gpsHistoryRangeTooLargeError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS history range exceeds the maximum",
    context: { reason: R.HISTORY_RANGE_TOO_LARGE },
  });
}

export function gpsHistoryResultTooLargeError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS history result is too large; request a shorter range",
    context: { reason: R.HISTORY_RESULT_TOO_LARGE },
  });
}

export function gpsMileageUnsupportedError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS mileage summary is not supported for this provider",
    context: { reason: R.MILEAGE_UNSUPPORTED },
  });
}

export function gpsOverspeedUnsupportedError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS overspeed report is not supported for this provider",
    context: { reason: R.OVERSPEED_UNSUPPORTED },
  });
}

export function gpsOverspeedInvalidThresholdError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS overspeed threshold is invalid",
    context: { reason: R.OVERSPEED_INVALID_THRESHOLD },
  });
}

export function gpsDeviceMetadataUnsupportedError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS device metadata is not supported for this provider",
    context: { reason: R.DEVICE_METADATA_UNSUPPORTED },
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

export function gpsProviderAccountNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "GPS provider account not found",
    context: { reason: R.PROVIDER_ACCOUNT_NOT_FOUND },
  });
}

/** Reserved for sync/management when automatic provider polling is disabled for the account. */
export function gpsProviderAccountDisabledError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS provider account synchronization is disabled",
    context: { reason: R.PROVIDER_ACCOUNT_DISABLED },
  });
}

export function gpsCompanyScopeViolationError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Vehicle company is outside the GPS provider account scope",
    context: { reason: R.COMPANY_SCOPE_VIOLATION },
  });
}

export function gpsBindingDeviceConflictError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "GPS device is already bound to another vehicle",
    context: { reason: R.DEVICE_ALREADY_BOUND },
  });
}

export function gpsProviderExtrasInvalidError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "GPS provider metadata is invalid",
    context: { reason: R.PROVIDER_EXTRAS_INVALID },
  });
}

function providerTransportError(
  reason: (typeof R)[keyof typeof R],
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
): AppError {
  return new AppError({ code, message, context: { reason } });
}

export function gpsProviderNotConfiguredError(): AppError {
  return providerTransportError(
    R.PROVIDER_NOT_CONFIGURED,
    ErrorCode.CONFLICT,
    "GPS provider account is not configured",
  );
}

export function gpsProviderAuthFailedError(): AppError {
  return providerTransportError(
    R.PROVIDER_AUTH_FAILED,
    ErrorCode.UNAUTHORIZED,
    "GPS provider authentication failed",
  );
}

export function gpsProviderSessionExpiredError(): AppError {
  return providerTransportError(
    R.PROVIDER_SESSION_EXPIRED,
    ErrorCode.UNAUTHORIZED,
    "GPS provider session expired",
  );
}

export function gpsProviderTimeoutError(): AppError {
  return providerTransportError(
    R.PROVIDER_TIMEOUT,
    ErrorCode.CONFLICT,
    "GPS provider request timed out",
  );
}

export function gpsProviderConnectionFailedError(): AppError {
  return providerTransportError(
    R.PROVIDER_CONNECTION_FAILED,
    ErrorCode.CONFLICT,
    "GPS provider connection failed",
  );
}

export function gpsProviderInvalidResponseError(): AppError {
  return providerTransportError(
    R.PROVIDER_INVALID_RESPONSE,
    ErrorCode.CONFLICT,
    "GPS provider returned an invalid response",
  );
}

export function gpsProviderRemoteError(): AppError {
  return providerTransportError(
    R.PROVIDER_REMOTE_ERROR,
    ErrorCode.CONFLICT,
    "GPS provider returned an error",
  );
}
