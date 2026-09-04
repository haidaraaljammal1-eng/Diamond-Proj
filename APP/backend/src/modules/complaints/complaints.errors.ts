import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/** Stable, machine-readable reasons for complaint-domain errors (frontend branches on these). */
export const ComplaintErrorReason = {
  COMPLAINT_NOT_FOUND: "complaint_not_found",
  COMPLAINT_OUT_OF_SCOPE: "complaint_out_of_scope",
  COMPLAINT_ALREADY_CLOSED: "complaint_already_closed",
  COMPLAINT_NOT_OPEN: "complaint_not_open",
  COMPLAINT_NOT_RESOLVED: "complaint_not_resolved",
  COMPLAINT_INVALID_TRANSITION: "complaint_invalid_transition",
  COMPLAINT_REVISION_CONFLICT: "complaint_revision_conflict",
  COMPLAINT_ASSIGNEE_NOT_ELIGIBLE: "complaint_assignee_not_eligible",
  COMPLAINT_DEPARTMENT_REQUIRED: "complaint_department_required",
  COMPLAINT_RESOLUTION_REQUIRED: "complaint_resolution_required",
  COMPLAINT_ALREADY_ESCALATED: "complaint_already_escalated",
  COMPLAINT_REOPEN_NOT_ALLOWED: "complaint_reopen_not_allowed",
  COMPLAINT_BRANCH_CONFLICT: "complaint_branch_conflict",
  ROUTING_RULE_NOT_FOUND: "routing_rule_not_found",
  ROUTING_RULE_INVALID_CONDITION: "routing_rule_invalid_condition",
  ROUTING_RULE_CONFLICT: "routing_rule_conflict",
  ROUTING_RULE_DEPARTMENT_INVALID: "routing_rule_department_invalid",
  ROUTING_RULE_DUPLICATE: "routing_rule_duplicate",
  ESCALATION_TARGET_INVALID: "escalation_target_invalid",
  ESCALATION_TARGET_OUT_OF_SCOPE: "escalation_target_out_of_scope",
  ESCALATION_TARGET_SAME: "escalation_target_same",
  SLA_POLICY_NOT_FOUND: "sla_policy_not_found",
  COMPLAINT_NOTIFICATION_SETTING_CONFLICT: "complaint_notification_setting_conflict",
  COMPLAINT_NOTIFICATION_INVALID_EVENT: "complaint_notification_invalid_event",
  ATTACHMENT_TYPE_NOT_ALLOWED: "attachment_type_not_allowed",
  ATTACHMENT_TOO_LARGE: "attachment_too_large",
  ATTACHMENT_NOT_AVAILABLE: "attachment_not_available",
  ATTACHMENT_INVALID_CONTENT: "attachment_invalid_content",
  EXPORT_TOO_LARGE: "export_too_large",
  CATEGORY_NOT_FOUND: "category_not_found",
} as const;
export type ComplaintErrorReason = (typeof ComplaintErrorReason)[keyof typeof ComplaintErrorReason];

const R = ComplaintErrorReason;

/** 404 — no complaint with this id, or out of the caller's branch scope (existence hidden). */
export function complaintNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Complaint not found", context: { reason: R.COMPLAINT_NOT_FOUND } });
}
export function categoryNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Complaint category not found", context: { reason: R.CATEGORY_NOT_FOUND } });
}
export function complaintAlreadyClosedError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This complaint is already closed", context: { reason: R.COMPLAINT_ALREADY_CLOSED } });
}
export function complaintNotOpenError(status: string): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This complaint is not open", context: { reason: R.COMPLAINT_NOT_OPEN, status } });
}
export function complaintNotResolvedError(): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This complaint is not resolved", context: { reason: R.COMPLAINT_NOT_RESOLVED } });
}
export function invalidTransitionError(from: string, to: string): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This complaint stage transition is not allowed", context: { reason: R.COMPLAINT_INVALID_TRANSITION, from, to } });
}
/** 409 — optimistic revision mismatch; carries currentRevision for a guided reload. */
export function revisionConflictError(expected: number, currentRevision: number): AppError {
  return new AppError({ code: ErrorCode.RESOURCE_MODIFIED, message: "The complaint was modified by another request; reload and retry", context: { reason: R.COMPLAINT_REVISION_CONFLICT, expected, currentRevision } });
}
export function assigneeNotEligibleError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The selected assignee is not eligible for this complaint", context: { reason: R.COMPLAINT_ASSIGNEE_NOT_ELIGIBLE, detail } });
}
export function departmentRequiredError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "A department is required for this complaint", context: { reason: R.COMPLAINT_DEPARTMENT_REQUIRED } });
}
export function resolutionRequiredError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "A resolution summary is required to close this complaint", context: { reason: R.COMPLAINT_RESOLUTION_REQUIRED } });
}
export function alreadyEscalatedError(level: number): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "This complaint is already at this escalation level", context: { reason: R.COMPLAINT_ALREADY_ESCALATED, level } });
}
/** 422 — the escalation destination does not exist or cannot receive a case. */
export function escalationTargetInvalidError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The escalation destination is not available", context: { reason: R.ESCALATION_TARGET_INVALID, detail } });
}
/** 403 — the destination belongs to a branch the caller does not cover. The
 *  message names NOTHING about the department: an out-of-scope caller must not
 *  learn that it exists, let alone what it is called. */
export function escalationTargetOutOfScopeError(): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "You cannot escalate to this destination", context: { reason: R.ESCALATION_TARGET_OUT_OF_SCOPE } });
}
/** 422 — escalating a case to exactly where it already sits is a no-op that
 *  would still create history and notifications; refuse it instead. */
export function escalationTargetSameError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The case is already with this department and employee", context: { reason: R.ESCALATION_TARGET_SAME } });
}
export function reopenNotAllowedError(status: string): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "Only resolved or closed complaints can be reopened", context: { reason: R.COMPLAINT_REOPEN_NOT_ALLOWED, status } });
}
export function branchConflictError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The requested branch conflicts with the purchase experience branch", context: { reason: R.COMPLAINT_BRANCH_CONFLICT } });
}
/** 403 — a write targets a branch outside the caller's scope. */
export function outOfScopeError(): AppError {
  return new AppError({ code: ErrorCode.FORBIDDEN, message: "This complaint is outside your assigned scope", context: { reason: R.COMPLAINT_OUT_OF_SCOPE } });
}

export function routingRuleNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "Routing rule not found", context: { reason: R.ROUTING_RULE_NOT_FOUND } });
}
export function routingRuleInvalidConditionError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The routing rule condition is invalid", context: { reason: R.ROUTING_RULE_INVALID_CONDITION, detail } });
}
export function routingRuleStaleError(expected: number, currentRevision: number): AppError {
  return new AppError({ code: ErrorCode.RESOURCE_MODIFIED, message: "The routing rule was modified by another request; reload and retry", context: { reason: R.ROUTING_RULE_CONFLICT, expected, currentRevision } });
}
/** 422 — the rule's destination department does not exist or is not active. A rule
 *  must never be able to park cases in a department that cannot receive them. */
export function routingRuleDepartmentInvalidError(detail: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The destination department is not available", context: { reason: R.ROUTING_RULE_DEPARTMENT_INVALID, detail } });
}
/** 409 — another rule already tests exactly the same condition on the same scope.
 *  Carries the existing rule so the UI can offer "open it" instead of a dead end. */
export function routingRuleDuplicateError(existingRuleId: number, existingRuleName: string): AppError {
  return new AppError({ code: ErrorCode.CONFLICT, message: "Another routing rule already uses this exact condition", context: { reason: R.ROUTING_RULE_DUPLICATE, existingRuleId, existingRuleName } });
}
export function slaPolicyNotFoundError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "SLA policy not found", context: { reason: R.SLA_POLICY_NOT_FOUND } });
}
export function slaPolicyStaleError(expected: number, currentRevision: number): AppError {
  return new AppError({ code: ErrorCode.RESOURCE_MODIFIED, message: "The SLA policy was modified by another request; reload and retry", context: { reason: R.COMPLAINT_REVISION_CONFLICT, expected, currentRevision } });
}

/** 409 — notification setting revision mismatch; carries currentRevision for a guided reload. */
export function complaintNotificationSettingStaleError(expected: number, currentRevision: number): AppError {
  return new AppError({ code: ErrorCode.RESOURCE_MODIFIED, message: "The notification setting was modified by another request; reload and retry", context: { reason: R.COMPLAINT_NOTIFICATION_SETTING_CONFLICT, expected, currentRevision } });
}
/** 422 — a notification setting update targets an event key outside the complaint catalog. */
export function complaintNotificationInvalidEventError(eventKey: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "Unknown complaint notification event", context: { reason: R.COMPLAINT_NOTIFICATION_INVALID_EVENT, eventKey } });
}

export function attachmentTypeNotAllowedError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "This attachment type is not allowed", context: { reason: R.ATTACHMENT_TYPE_NOT_ALLOWED } });
}
export function attachmentTooLargeError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, statusCode: 413, message: "The attachment is too large", context: { reason: R.ATTACHMENT_TOO_LARGE } });
}
export function attachmentInvalidContentError(): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The attachment failed content validation", context: { reason: R.ATTACHMENT_INVALID_CONTENT } });
}
export function attachmentNotAvailableError(): AppError {
  return new AppError({ code: ErrorCode.NOT_FOUND, message: "The attachment is not available", context: { reason: R.ATTACHMENT_NOT_AVAILABLE } });
}
export function exportTooLargeError(total: number, limit: number): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "The export exceeds the maximum size; narrow the filters", context: { reason: R.EXPORT_TOO_LARGE, total, limit } });
}
