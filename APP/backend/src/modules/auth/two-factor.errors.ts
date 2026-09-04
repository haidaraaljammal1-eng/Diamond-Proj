import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Stable, machine-readable reasons for the two-factor domain.
 *
 * Deliberate asymmetry in HTTP status:
 *  - The PUBLIC login-challenge endpoints answer 401 (the caller holds no session).
 *  - The AUTHENTICATED management endpoints answer 422 even for a wrong password
 *    or code, because a 401 there reads as "your session died" to every client
 *    and would bounce a signed-in user out of a settings dialog.
 *
 * Deliberate vagueness: a rejected code never says whether it was wrong, expired,
 * replayed, or an already-spent recovery code — one reason covers them all.
 */
export const TwoFactorErrorReason = {
  INVALID_CODE: "two_factor_invalid_code",
  CHALLENGE_INVALID: "two_factor_challenge_invalid",
  CHALLENGE_EXPIRED: "two_factor_challenge_expired",
  TOO_MANY_ATTEMPTS: "two_factor_too_many_attempts",
  ALREADY_ENABLED: "two_factor_already_enabled",
  NOT_ENABLED: "two_factor_not_enabled",
  SETUP_NOT_STARTED: "two_factor_setup_not_started",
  PASSWORD_INVALID: "two_factor_password_invalid",
  SECOND_FACTOR_REQUIRED: "two_factor_second_factor_required",
} as const;
export type TwoFactorErrorReason =
  (typeof TwoFactorErrorReason)[keyof typeof TwoFactorErrorReason];

function validation(reason: TwoFactorErrorReason, message: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason },
  });
}

function unauthorized(reason: TwoFactorErrorReason, message: string): AppError {
  return new AppError({ code: ErrorCode.UNAUTHORIZED, message, context: { reason } });
}

/**
 * A submitted code was not accepted. ONE error for every cause (wrong digits,
 * expired step, replayed step, unknown or already-used recovery code) so the
 * response cannot be used as an oracle. `authenticated` picks the status only.
 */
export const invalidTwoFactorCodeError = (authenticated: boolean) =>
  (authenticated ? validation : unauthorized)(
    TwoFactorErrorReason.INVALID_CODE,
    "The verification code is incorrect or has expired",
  );

/** The challenge token is unknown, already spent, or was burned by too many attempts. */
export const challengeInvalidError = () =>
  unauthorized(
    TwoFactorErrorReason.CHALLENGE_INVALID,
    "The verification session is no longer valid, please sign in again",
  );

/** The challenge outlived its TTL — the client must restart the login. */
export const challengeExpiredError = () =>
  unauthorized(
    TwoFactorErrorReason.CHALLENGE_EXPIRED,
    "The verification session has expired, please sign in again",
  );

/** Per-challenge attempt budget exhausted; the challenge is now dead. */
export const tooManyAttemptsError = () =>
  new AppError({
    code: ErrorCode.RATE_LIMITED,
    message: "Too many incorrect attempts, please sign in again",
    context: { reason: TwoFactorErrorReason.TOO_MANY_ATTEMPTS },
  });

export const twoFactorAlreadyEnabledError = () =>
  validation(
    TwoFactorErrorReason.ALREADY_ENABLED,
    "Two-factor authentication is already enabled",
  );

export const twoFactorNotEnabledError = () =>
  validation(
    TwoFactorErrorReason.NOT_ENABLED,
    "Two-factor authentication is not enabled",
  );

export const twoFactorSetupNotStartedError = () =>
  validation(
    TwoFactorErrorReason.SETUP_NOT_STARTED,
    "Start two-factor setup again — no pending setup was found or it has expired",
  );

export const passwordInvalidError = () =>
  validation(TwoFactorErrorReason.PASSWORD_INVALID, "The current password is incorrect");

/** Disable / regenerate require a live second factor, not just the password. */
export const secondFactorRequiredError = () =>
  validation(
    TwoFactorErrorReason.SECOND_FACTOR_REQUIRED,
    "Enter a code from your authenticator app or a recovery code",
  );
