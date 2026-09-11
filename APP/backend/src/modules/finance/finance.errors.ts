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

export function financePeriodTooLongError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Finance reporting period is too long",
    context: { reason: R.PERIOD_TOO_LONG },
  });
}
