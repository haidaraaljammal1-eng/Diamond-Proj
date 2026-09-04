import {
  DEFAULT_STATUS_FOR_CODE,
  ErrorCode,
  type ErrorCode as ErrorCodeValue,
} from "src/constants/error-codes";

export interface ConflictDetail {
  resource?: string;
  field?: string;
  message: string;
  [key: string]: unknown;
}

export interface SuggestedAction {
  action: string;
  label?: string;
  [key: string]: unknown;
}

export interface AppErrorOptions {
  code: ErrorCodeValue;
  /** English message KEY (see src/config/i18n.ts). Localized centrally by the handler. */
  message: string;
  statusCode?: number;
  details?: unknown;
  context?: Record<string, unknown>;
  conflicts?: ConflictDetail[];
  suggestedActions?: SuggestedAction[];
  cause?: unknown;
}

/**
 * Structured application error. Throw this (never try/catch to build an error
 * response) — the global error handler formats it into the standard envelope.
 * The frontend branches on `code`, never on the localized message.
 */
export class AppError extends Error {
  readonly isAppError = true;
  readonly code: ErrorCodeValue;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly context?: Record<string, unknown>;
  readonly conflicts?: ConflictDetail[];
  readonly suggestedActions?: SuggestedAction[];

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = "AppError";
    this.code = opts.code;
    this.statusCode = opts.statusCode ?? DEFAULT_STATUS_FOR_CODE[opts.code];
    this.details = opts.details;
    this.context = opts.context;
    this.conflicts = opts.conflicts;
    this.suggestedActions = opts.suggestedActions;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  static unauthorized(message = "Authentication required") {
    return new AppError({ code: ErrorCode.UNAUTHORIZED, message });
  }

  static forbidden(message = "You do not have permission to perform this action") {
    return new AppError({ code: ErrorCode.FORBIDDEN, message });
  }

  static notFound(message = "Resource not found", context?: Record<string, unknown>) {
    return new AppError({ code: ErrorCode.NOT_FOUND, message, context });
  }

  static conflict(
    message = "A conflicting resource already exists",
    conflicts?: ConflictDetail[],
  ) {
    return new AppError({ code: ErrorCode.CONFLICT, message, conflicts });
  }

  static validation(message = "Validation failed", details?: unknown) {
    return new AppError({ code: ErrorCode.VALIDATION_ERROR, message, details });
  }

  static modified(context?: Record<string, unknown>) {
    return new AppError({
      code: ErrorCode.RESOURCE_MODIFIED,
      message: "Resource has been modified by another request",
      context,
    });
  }
}

export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof AppError ||
    (typeof err === "object" && err !== null && "isAppError" in err)
  );
}
