import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const ArchiveErrorReason = {
  ARCHIVE_ROW_NOT_FOUND: "ARCHIVE_ROW_NOT_FOUND",
  VEHICLE_NOT_FOUND: "VEHICLE_NOT_FOUND",
} as const;

const R = ArchiveErrorReason;

export function archiveRowNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Archive row not found",
    context: { reason: R.ARCHIVE_ROW_NOT_FOUND },
  });
}

export function vehicleNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Vehicle not found",
    context: { reason: R.VEHICLE_NOT_FOUND },
  });
}
