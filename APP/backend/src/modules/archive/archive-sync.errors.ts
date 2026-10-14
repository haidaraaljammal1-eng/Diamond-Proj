import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const ArchiveSyncErrorReason = {
  SYNC_ALREADY_RUNNING: "SYNC_ALREADY_RUNNING",
} as const;

export function archiveSyncAlreadyRunningError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Archive sync is already running",
    context: { reason: ArchiveSyncErrorReason.SYNC_ALREADY_RUNNING },
  });
}
