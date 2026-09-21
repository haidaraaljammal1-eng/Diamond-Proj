import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Stable, machine-readable reasons for import errors. The frontend branches on
 * these constants, never on localized message text — same convention as
 * `DomainErrorReason` in `src/lib/master-data/code.ts`. Some values intentionally
 * reuse the domain reasons (`invalid_parent`, `inactive_reference`,
 * `immutable_field`) so a single client switch handles both surfaces.
 */
export const ImportErrorReason = {
  INVALID_FILE_TYPE: "invalid_file_type",
  INVALID_XLSX_CONTENT: "invalid_xlsx_content",
  FILE_TOO_LARGE: "file_too_large",
  DUPLICATE_UPLOAD: "duplicate_upload",
  INVALID_MAPPING: "invalid_mapping",
  MISSING_REQUIRED_COLUMN: "missing_required_column",
  INVALID_ROW: "invalid_row",
  DUPLICATE_RECORD: "duplicate_record",
  AMBIGUOUS_CUSTOMER_MATCH: "ambiguous_customer_match",
  MISSING_EXPERIENCE_IDENTITY: "missing_experience_identity",
  INVALID_PARENT: "invalid_parent",
  /**
   * The row references a Vehicle that is not in the fleet. Imports are
   * match-only: Fleet → Add Vehicle is Diamond's single Vehicle creation source,
   * so the operator creates the vehicle there (choosing UNIQUE or ELITE) and
   * re-runs the import instead of the importer inventing one.
   */
  VEHICLE_NOT_FOUND: "vehicle_not_found",
  INACTIVE_REFERENCE: "inactive_reference",
  IMMUTABLE_FIELD: "immutable_field",
  IMPORT_NOT_READY: "import_not_ready",
  IMPORT_ALREADY_PROCESSED: "import_already_processed",
  /** A confirm "link to existing" resolution pointed at a missing/inactive record. */
  INVALID_RESOLUTION_TARGET: "invalid_resolution_target",
  /** A row-resolve action targeted a row not in a resolvable (NEEDS_MANUAL_REVIEW) state. */
  ROW_NOT_RESOLVABLE: "row_not_resolvable",
  /** Re-executing a resolved row failed (e.g. its master data no longer resolves). */
  ROW_RESOLUTION_FAILED: "row_resolution_failed",
} as const;
export type ImportErrorReason =
  (typeof ImportErrorReason)[keyof typeof ImportErrorReason];

// --- Job-level errors (thrown as AppError; halt the current API call) ---

/** 422 — declared type / extension / content is not an accepted import format. */
export function invalidFileTypeError(message = "Import file type is not supported"): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason: ImportErrorReason.INVALID_FILE_TYPE },
  });
}

/**
 * 422 — the upload IS a valid XLSX/ZIP container (right type) but the workbook
 * itself is corrupt or unreadable by the parser. Distinct from
 * {@link invalidFileTypeError}: the type is right, the *content* is not — so the
 * client can tell "wrong file" apart from "broken spreadsheet".
 */
export function invalidXlsxContentError(
  message = "Import file is not a readable XLSX workbook",
): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason: ImportErrorReason.INVALID_XLSX_CONTENT },
  });
}

/** 413 — the uploaded file exceeded the configured size limit. */
export function fileTooLargeError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Import file is too large",
    statusCode: 413,
    context: { reason: ImportErrorReason.FILE_TOO_LARGE },
  });
}

/**
 * 409 — an identical file (same sha256) already has a live import job. Guides the
 * client to the existing job instead of silently processing a duplicate. Jobs in a
 * terminal-dead state (FAILED/CANCELLED) do NOT block a fresh upload.
 */
export function duplicateUploadError(existingJobId: number, existingStatus: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "An identical file has already been uploaded",
    context: {
      reason: ImportErrorReason.DUPLICATE_UPLOAD,
      importJobId: existingJobId,
      status: existingStatus,
    },
    suggestedActions: [
      { action: "open_import_job", label: "Open the existing import job", importJobId: existingJobId },
    ],
  });
}

/** 422 — the submitted column→field mapping is structurally invalid. */
export function invalidMappingError(message = "Import mapping is invalid", detail?: unknown): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details: detail,
    context: { reason: ImportErrorReason.INVALID_MAPPING },
  });
}

/** 422 — a required target field was not covered by the mapping. */
export function missingRequiredColumnError(fields: string[]): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Import mapping is missing required columns",
    details: { fields },
    context: { reason: ImportErrorReason.MISSING_REQUIRED_COLUMN, fields },
  });
}

/** 409 — an action requires the job to be validated/READY first. */
export function importNotReadyError(status: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Import job is not ready for this action",
    context: { reason: ImportErrorReason.IMPORT_NOT_READY, status },
  });
}

/** 409 — the job was already confirmed/completed/cancelled; no re-run. */
export function importAlreadyProcessedError(status: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Import job has already been processed",
    context: { reason: ImportErrorReason.IMPORT_ALREADY_PROCESSED, status },
  });
}

/** 422 — a confirm/resolve "link to existing" resolution referenced a missing/inactive record. */
export function invalidResolutionTargetError(
  entity: "vehicleModel" | "branch" | "customer",
  code: string,
): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "The selected record to link does not exist or is inactive",
    context: { reason: ImportErrorReason.INVALID_RESOLUTION_TARGET, entity, code },
  });
}

/**
 * 409 — a row-resolve action targeted a row that is not in the resolvable
 * `NEEDS_MANUAL_REVIEW` state (already resolved, missing, or the job is not
 * `COMPLETED_WITH_ERRORS`). Idempotent guard: a row cannot be resolved twice.
 */
export function rowNotResolvableError(status: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This import row cannot be resolved",
    context: { reason: ImportErrorReason.ROW_NOT_RESOLVABLE, status },
  });
}

/**
 * 422 — re-executing a manual-review row with the chosen resolution failed (e.g.
 * the row references master data that no longer resolves). The row stays
 * `NEEDS_MANUAL_REVIEW` (its transaction rolled back).
 */
export function rowResolutionFailedError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "The row could not be imported with the chosen resolution",
    context: { reason: ImportErrorReason.ROW_RESOLUTION_FAILED },
  });
}

// --- Row-level issue (data, NOT thrown; collected per row) ---

export interface RowIssue {
  field: string | null;
  /** Short machine code specific to the check (e.g. "required", "unknown_branch"). */
  code: string;
  /** Stable {@link ImportErrorReason} bucket for client branching. */
  reason: ImportErrorReason;
  /** Human-readable, templated — never echoes raw cell PII beyond a field label. */
  message: string;
  suggestedAction?: string;
}

export function rowIssue(
  field: string | null,
  code: string,
  reason: ImportErrorReason,
  message: string,
  suggestedAction?: string,
): RowIssue {
  return { field, code, reason, message, ...(suggestedAction ? { suggestedAction } : {}) };
}
