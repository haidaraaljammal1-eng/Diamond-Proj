import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/** Stable, machine-readable reasons for reports/integrations/security errors. */
export const ReportErrorReason = {
  REPORT_NOT_FOUND: "report_not_found",
  REPORT_INVALID_PERIOD: "report_invalid_period",
  REPORT_EXPORT_TOO_LARGE: "report_export_too_large",
  REPORT_FORMAT_NOT_SUPPORTED: "report_format_not_supported",
  REPORT_SCHEDULE_NOT_FOUND: "report_schedule_not_found",
  REPORT_SCHEDULE_INVALID: "report_schedule_invalid",
  REPORT_PROVIDER_NOT_CONFIGURED: "report_provider_not_configured",
  REPORT_ARTIFACT_NOT_AVAILABLE: "report_artifact_not_available",
  REPORT_PDF_RENDER_FAILED: "report_pdf_render_failed",
  TARGET_NOT_FOUND: "report_target_not_found",
  TARGET_OVERLAP: "report_target_overlap",
  API_KEY_NOT_FOUND: "api_key_not_found",
  API_KEY_REVOKED: "api_key_revoked",
  API_KEY_EXPIRED: "api_key_expired",
  API_KEY_INVALID: "api_key_invalid",
  API_KEY_SCOPE_DENIED: "api_key_scope_denied",
  API_KEY_BRANCH_SCOPE_DENIED: "api_key_branch_scope_denied",
  INTEGRATION_NOT_FOUND: "integration_not_found",
  INTEGRATION_NOT_CONFIGURED: "integration_not_configured",
  INTEGRATION_HEALTH_CHECK_FAILED: "integration_health_check_failed",
  AUDIT_EXPORT_TOO_LARGE: "audit_export_too_large",
  AUDIT_ENTRY_NOT_FOUND: "audit_entry_not_found",
} as const;
export type ReportErrorReason = (typeof ReportErrorReason)[keyof typeof ReportErrorReason];

const R = ReportErrorReason;

export function reportNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Report not found", context: { reason: R.REPORT_NOT_FOUND } });
}
export function invalidPeriodError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The reporting period is invalid", context: { reason: R.REPORT_INVALID_PERIOD, detail } });
}
export function reportExportTooLargeError(total: number, limit: number): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The report export exceeds the maximum size; narrow the filters", context: { reason: R.REPORT_EXPORT_TOO_LARGE, total, limit } });
}
export function reportFormatNotSupportedError(format: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "This report format is not supported", context: { reason: R.REPORT_FORMAT_NOT_SUPPORTED, format } });
}
export function reportScheduleNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Report schedule not found", context: { reason: R.REPORT_SCHEDULE_NOT_FOUND } });
}
export function reportScheduleInvalidError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The report schedule is invalid", context: { reason: R.REPORT_SCHEDULE_INVALID, detail } });
}
export function reportArtifactNotAvailableError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "The report artifact is not available", context: { reason: R.REPORT_ARTIFACT_NOT_AVAILABLE } });
}
export function reportPdfRenderFailedError(cause?: unknown): AppError {
  return new AppError({ code: ErrorCode.INTERNAL_ERROR, message: "The report PDF could not be generated", context: { reason: R.REPORT_PDF_RENDER_FAILED }, cause });
}
export function targetNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "KPI target not found", context: { reason: R.TARGET_NOT_FOUND } });
}
export function targetOverlapError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "An overlapping active KPI target already exists for this scope/period", context: { reason: R.TARGET_OVERLAP } });
}
export function apiKeyNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "API key not found", context: { reason: R.API_KEY_NOT_FOUND } });
}
export function apiKeyUnauthorizedError(reason: ReportErrorReason): AppError {
  return new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason } });
}
export function apiKeyScopeDeniedError(scope: string): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "The API key lacks the required scope", context: { reason: R.API_KEY_SCOPE_DENIED, scope } });
}
export function apiKeyBranchScopeDeniedError(): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "The API key lacks access to this branch", context: { reason: R.API_KEY_BRANCH_SCOPE_DENIED } });
}
export function integrationNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Integration not found", context: { reason: R.INTEGRATION_NOT_FOUND } });
}
export function integrationNotConfiguredError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This integration is not configured", context: { reason: R.INTEGRATION_NOT_CONFIGURED } });
}
export function auditExportTooLargeError(total: number, limit: number): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The audit export exceeds the maximum size; narrow the filters", context: { reason: R.AUDIT_EXPORT_TOO_LARGE, total, limit } });
}
export function auditEntryNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Audit log entry not found", context: { reason: R.AUDIT_ENTRY_NOT_FOUND } });
}
