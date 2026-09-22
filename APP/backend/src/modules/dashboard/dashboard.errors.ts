import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const DashboardErrorReason = {
  COMPANY_SCOPE_UNSUPPORTED: "DASHBOARD_COMPANY_SCOPE_UNSUPPORTED",
} as const;

/**
 * GENERAL is a Finance classification (`companyId IS NULL`), not an operating
 * company. The dashboard scopes operational companies only, so `companyScope`
 * is refused rather than silently treated as All Companies.
 */
export function dashboardCompanyScopeUnsupportedError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Dashboard does not support a GENERAL company scope",
    context: { reason: DashboardErrorReason.COMPANY_SCOPE_UNSUPPORTED },
  });
}
