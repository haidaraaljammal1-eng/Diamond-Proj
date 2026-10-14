import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const FinanceErrorReason = {
  EXPENSE_NOT_FOUND: "FINANCE_EXPENSE_NOT_FOUND",
  EXPENSE_ALREADY_VOID: "FINANCE_EXPENSE_ALREADY_VOID",
  EXPENSE_NOT_ACTIVE: "FINANCE_EXPENSE_NOT_ACTIVE",
  EXPENSE_NO_CHANGES: "FINANCE_EXPENSE_NO_CHANGES",
  VEHICLE_NOT_FOUND: "FINANCE_VEHICLE_NOT_FOUND",
  ATTACHMENT_NOT_FOUND: "FINANCE_ATTACHMENT_NOT_FOUND",
  PERIOD_TOO_LONG: "FINANCE_PERIOD_TOO_LONG",
  COMPANY_SCOPE_CONFLICT: "FINANCE_COMPANY_SCOPE_CONFLICT",
  STATEMENT_COMPANY_NOT_FOUND: "FINANCE_STATEMENT_COMPANY_NOT_FOUND",
  STATEMENT_PERIOD_INVALID: "FINANCE_STATEMENT_PERIOD_INVALID",
  STATEMENT_CONTRACT_INTEGRITY: "FINANCE_STATEMENT_CONTRACT_INTEGRITY",
} as const;

const R = FinanceErrorReason;

export function manualExpenseNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Manual expense not found",
    context: { reason: R.EXPENSE_NOT_FOUND },
  });
}

export function manualExpenseNotActiveError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Manual expense is not active",
    context: { reason: R.EXPENSE_NOT_ACTIVE },
  });
}

export function manualExpenseNoChangesError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "No expense fields changed",
    context: { reason: R.EXPENSE_NO_CHANGES },
  });
}

export function financeVehicleNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Vehicle not found",
    context: { reason: R.VEHICLE_NOT_FOUND },
  });
}

export function financeAttachmentNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Attachment not found",
    context: { reason: R.ATTACHMENT_NOT_FOUND },
  });
}

/**
 * GENERAL is `companyId IS NULL`, not an operating company, so it can never be
 * combined with a real company id. The contradiction is refused instead of being
 * silently resolved in favour of one of them.
 */
export function financeCompanyScopeConflictError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "companyScope=GENERAL cannot be combined with companyId",
    context: { reason: R.COMPANY_SCOPE_CONFLICT },
  });
}

export function financePeriodTooLongError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Finance reporting period is too long",
    context: { reason: R.PERIOD_TOO_LONG },
  });
}

export function financeStatementCompanyNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Operating company not found for statement export",
    context: { reason: R.STATEMENT_COMPANY_NOT_FOUND },
  });
}

export function financeStatementPeriodInvalidError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Statement period parameters are incomplete or invalid",
    context: { reason: R.STATEMENT_PERIOD_INVALID },
  });
}

export function financeStatementContractIntegrityError(ledgerEntryIds: string[]): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "Statement export blocked: contract-backed ledger entries lack a valid contract association",
    context: {
      reason: R.STATEMENT_CONTRACT_INTEGRITY,
      ledgerEntryIds,
    },
  });
}
