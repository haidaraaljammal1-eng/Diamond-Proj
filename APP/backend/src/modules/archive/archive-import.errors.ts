import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const ArchiveImportErrorReason = {
  INVALID_FILE_TYPE: "ARCHIVE_IMPORT_INVALID_FILE_TYPE",
  INVALID_WORKBOOK: "ARCHIVE_IMPORT_INVALID_WORKBOOK",
  INVALID_SHEET_LAYOUT: "ARCHIVE_IMPORT_INVALID_SHEET_LAYOUT",
  INVALID_HEADERS: "ARCHIVE_IMPORT_INVALID_HEADERS",
  EMPTY_WORKBOOK: "ARCHIVE_IMPORT_EMPTY_WORKBOOK",
  IMPORT_TOKEN_INVALID: "ARCHIVE_IMPORT_TOKEN_INVALID",
  IMPORT_TOKEN_EXPIRED: "ARCHIVE_IMPORT_TOKEN_EXPIRED",
  DUPLICATE_VEHICLE_SHEET: "ARCHIVE_IMPORT_DUPLICATE_VEHICLE_SHEET",
  AMBIGUOUS_VEHICLE: "ARCHIVE_IMPORT_AMBIGUOUS_VEHICLE",
  CONTRACT_LINK_METADATA_REQUIRED: "ARCHIVE_IMPORT_CONTRACT_LINK_METADATA_REQUIRED",
  CONTRACT_LINK_MISMATCH: "ARCHIVE_IMPORT_CONTRACT_LINK_MISMATCH",
} as const;

export interface ArchiveImportCellError {
  sheetName: string;
  vehiclePlate: string | null;
  row: number;
  column: string;
  value: string;
  reason: string;
}

export interface ArchiveImportUnmatchedSheet {
  sheetName: string;
  headerText: string | null;
  reason: string;
}

export function invalidArchiveImportFileError(message: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason: ArchiveImportErrorReason.INVALID_FILE_TYPE },
  });
}

export function invalidArchiveImportWorkbookError(message: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason: ArchiveImportErrorReason.INVALID_WORKBOOK },
  });
}

export function archiveImportContractLinkError(
  reason:
    | typeof ArchiveImportErrorReason.CONTRACT_LINK_METADATA_REQUIRED
    | typeof ArchiveImportErrorReason.CONTRACT_LINK_MISMATCH,
  message: string,
): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason },
  });
}

export function archiveImportTokenError(
  reason:
    | typeof ArchiveImportErrorReason.IMPORT_TOKEN_INVALID
    | typeof ArchiveImportErrorReason.IMPORT_TOKEN_EXPIRED,
): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Archive import session is invalid or expired",
    context: { reason },
  });
}
