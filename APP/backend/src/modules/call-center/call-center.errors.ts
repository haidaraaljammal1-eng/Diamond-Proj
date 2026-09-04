import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Stable, machine-readable reasons for call-center errors. The frontend branches
 * on THESE constants (via `context.reason`), never on localized message text.
 */
export const CallCenterErrorReason = {
  CALL_ITEM_NOT_FOUND: "call_item_not_found",
  CALL_ITEM_ALREADY_CLAIMED: "call_item_already_claimed",
  CALL_ITEM_NOT_CLAIMABLE: "call_item_not_claimable",
  CALL_ITEM_NOT_ASSIGNED_TO_USER: "call_item_not_assigned_to_user",
  CALL_NOT_FOUND: "call_not_found",
  CALL_ALREADY_ACTIVE: "call_already_active",
  CALL_ALREADY_COMPLETED: "call_already_completed",
  INVALID_CALL_OUTCOME: "invalid_call_outcome",
  CALLBACK_TIME_REQUIRED: "callback_time_required",
  CALLBACK_TIME_INVALID: "callback_time_invalid",
  CALLBACK_NOT_FOUND: "callback_not_found",
  MAX_ATTEMPTS_REACHED: "max_attempts_reached",
  CUSTOMER_UNREACHABLE: "customer_unreachable",
  CUSTOMER_OPTED_OUT_PHONE: "customer_opted_out_phone",
  RECORDING_NOT_AVAILABLE: "recording_not_available",
  RECORDING_ACCESS_FORBIDDEN: "recording_access_forbidden",
  QUEUE_ITEM_ALREADY_EXISTS: "queue_item_already_exists",
  INVALID_QUEUE_SOURCE: "invalid_queue_source",
  EXPORT_TOO_LARGE: "export_too_large",
  BRANCH_OUT_OF_SCOPE: "branch_out_of_scope",
} as const;
export type CallCenterErrorReason =
  (typeof CallCenterErrorReason)[keyof typeof CallCenterErrorReason];

const R = CallCenterErrorReason;

/** 404 — no queue item with this id (in the caller's scope). */
export function callItemNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Call queue item not found", context: { reason: R.CALL_ITEM_NOT_FOUND } });
}

/** 409 — the item is already claimed by another agent. */
export function callItemAlreadyClaimedError(assignedToUserId?: number | null): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This call is already claimed by another agent",
    context: { reason: R.CALL_ITEM_ALREADY_CLAIMED, assignedToUserId: assignedToUserId ?? null },
  });
}

/** 409 — the item is in a status that cannot be claimed/worked (terminal, etc.). */
export function callItemNotClaimableError(status: string): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This call item cannot be claimed in its current state", context: { reason: R.CALL_ITEM_NOT_CLAIMABLE, status } });
}

/** 403 — the item is assigned to a different agent and the caller cannot act on it. */
export function callItemNotAssignedToUserError(): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "This call item is assigned to another agent", context: { reason: R.CALL_ITEM_NOT_ASSIGNED_TO_USER } });
}

/** 404 — no call session with this id (in the caller's scope). */
export function callNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Call session not found", context: { reason: R.CALL_NOT_FOUND } });
}

/** 409 — a call session is already in progress for this queue item. */
export function callAlreadyActiveError(callSessionId: number): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "A call is already in progress for this item", context: { reason: R.CALL_ALREADY_ACTIVE, callSessionId } });
}

/** 409 — the call session is already completed (idempotent double-complete guard). */
export function callAlreadyCompletedError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This call is already completed", context: { reason: R.CALL_ALREADY_COMPLETED } });
}

/** 422 — the outcome value is not a valid call outcome. */
export function invalidCallOutcomeError(outcome: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "Invalid call outcome", context: { reason: R.INVALID_CALL_OUTCOME, outcome } });
}

/** 422 — CALLBACK_REQUESTED outcome without a callback time. */
export function callbackTimeRequiredError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "A callback time is required for this outcome", context: { reason: R.CALLBACK_TIME_REQUIRED } });
}

/** 422 — the provided callback time is in the past or otherwise invalid. */
export function callbackTimeInvalidError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The callback time must be in the future", context: { reason: R.CALLBACK_TIME_INVALID } });
}

/** 404 — no callback with this id. */
export function callbackNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Callback not found", context: { reason: R.CALLBACK_NOT_FOUND } });
}

/** 409 — the item has already exhausted its unanswered-attempt budget. */
export function maxAttemptsReachedError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This item has reached the maximum number of attempts", context: { reason: R.MAX_ATTEMPTS_REACHED } });
}

/** 409 — the customer withdrew consent to be contacted by phone (`optOutPhone`).
 *  Consent is enforced on the normal claim/start-call path, not just in the UI. */
export function customerOptedOutPhoneError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This customer has opted out of phone contact",
    context: { reason: R.CUSTOMER_OPTED_OUT_PHONE },
  });
}

/** 409 — the item is terminally marked unreachable. */
export function customerUnreachableError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This customer is marked unreachable", context: { reason: R.CUSTOMER_UNREACHABLE } });
}

/** 404 — no recording is available for this call. */
export function recordingNotAvailableError(status: string): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "No recording is available for this call", context: { reason: R.RECORDING_NOT_AVAILABLE, status } });
}

/** 403 — the caller lacks permission to access recordings. */
export function recordingAccessForbiddenError(): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "You are not allowed to access call recordings", context: { reason: R.RECORDING_ACCESS_FORBIDDEN } });
}

/** 409 — an active queue item already exists for this customer + reason. */
export function queueItemAlreadyExistsError(dedupeKey: string): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "An active call item already exists for this reason", context: { reason: R.QUEUE_ITEM_ALREADY_EXISTS, dedupeKey } });
}

/** 422 — the queue source/type is not valid for the requested operation. */
export function invalidQueueSourceError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "Invalid queue source", context: { reason: R.INVALID_QUEUE_SOURCE, detail } });
}

/** 422 — export exceeds the maximum size; narrow the filters. */
export function exportTooLargeError(total: number, limit: number): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The export exceeds the maximum size; narrow the filters", context: { reason: R.EXPORT_TOO_LARGE, total, limit } });
}

/** 403 — a write targets a branch the caller is not assigned to (and is not global). */
export function branchOutOfScopeError(): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "This branch is outside your assigned scope", context: { reason: R.BRANCH_OUT_OF_SCOPE } });
}
