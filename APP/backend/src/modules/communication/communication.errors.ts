import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/** Stable, machine-readable reasons for the communication-template domain. */
export const CommunicationErrorReason = {
  IMMUTABLE_FIELD: "immutable_field",
  PUBLISHED_VERSION_IMMUTABLE: "published_version_immutable",
  TEMPLATE_NOT_PUBLISHED: "template_not_published",
  INVALID_TEMPLATE_CONTENT: "invalid_template_content",
  INVALID_TEMPLATE_VARIABLE: "invalid_template_variable",
  UNKNOWN_TEMPLATE_VARIABLE: "unknown_template_variable",
  UNSAFE_TEMPLATE_CONTENT: "unsafe_template_content",
  MISSING_ACTION_LINK: "missing_action_link",
  STALE_REVISION: "stale_revision",
  DRAFT_ALREADY_EXISTS: "draft_already_exists",
  TEMPLATE_IN_USE: "template_in_use",
} as const;
export type CommunicationErrorReason =
  (typeof CommunicationErrorReason)[keyof typeof CommunicationErrorReason];

/** A path-addressable content issue (unknown/malformed/unsafe variable or URL). */
export interface TemplateContentIssue {
  reason: CommunicationErrorReason;
  code: string;
  path: string;
  message: string;
  suggestedAction?: string;
}

export function templateContentIssue(
  reason: CommunicationErrorReason,
  code: string,
  path: string,
  message: string,
  suggestedAction?: string,
): TemplateContentIssue {
  return { reason, code, path, message, ...(suggestedAction ? { suggestedAction } : {}) };
}

export function templateCodeConflict(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "A communication template with this code already exists",
    conflicts: [
      { resource: "communication_template", field: "code", message: "A communication template with this code already exists" },
    ],
  });
}

export function templateImmutableFieldError(field: string): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "This field cannot be changed after creation",
    context: { field, reason: CommunicationErrorReason.IMMUTABLE_FIELD },
  });
}

export function templatePublishedImmutableError(status: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "A published template version cannot be modified",
    context: { reason: CommunicationErrorReason.PUBLISHED_VERSION_IMMUTABLE, status },
  });
}

export function templateStaleRevisionError(expected: number, actual: number): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "The draft was modified by another request; reload and retry",
    context: { reason: CommunicationErrorReason.STALE_REVISION, expected, actual },
  });
}

export function templateDraftAlreadyExistsError(draftVersionId: number): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This template already has an open draft version",
    context: { reason: CommunicationErrorReason.DRAFT_ALREADY_EXISTS, draftVersionId },
  });
}

/** 409 — the template is referenced by a campaign step and/or an actual delivery,
 *  so it cannot be deleted. Carries the reference counts for a guided message. */
export function templateInUseError(campaigns: number, deliveries: number): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This template is in use and cannot be deleted",
    context: {
      reason: CommunicationErrorReason.TEMPLATE_IN_USE,
      campaigns,
      deliveries,
    },
  });
}

/** 422 — the template content failed variable/URL/content validation. */
export function invalidTemplateContentError(issues: TemplateContentIssue[]): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "The template content is invalid",
    details: { issues },
    context: { reason: CommunicationErrorReason.INVALID_TEMPLATE_CONTENT },
  });
}
