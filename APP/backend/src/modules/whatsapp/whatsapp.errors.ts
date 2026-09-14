import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";

function err(
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
  reason: string,
  extra?: Record<string, unknown>,
): AppError {
  return new AppError({ code, message, context: { reason, ...extra } });
}

export const WhatsAppErrorReason = {
  PROVIDER_NOT_CONFIGURED: "WHATSAPP_PROVIDER_NOT_CONFIGURED",
  CONNECTION_ATTEMPT_EXPIRED: "WHATSAPP_CONNECTION_ATTEMPT_EXPIRED",
  CONNECTION_ATTEMPT_USED: "WHATSAPP_CONNECTION_ATTEMPT_USED",
  PROVIDER_AUTH_FAILED: "WHATSAPP_PROVIDER_AUTH_FAILED",
  WABA_NOT_GRANTED: "WHATSAPP_WABA_NOT_GRANTED",
  PHONE_NOT_GRANTED: "WHATSAPP_PHONE_NOT_GRANTED",
  CONNECTION_VALIDATION_FAILED: "WHATSAPP_CONNECTION_VALIDATION_FAILED",
  CONNECTION_NOT_FOUND: "WHATSAPP_CONNECTION_NOT_FOUND",
  CONNECTION_ALREADY_CHANGED: "WHATSAPP_CONNECTION_ALREADY_CHANGED",
  CONNECTION_ATTEMPT_NOT_FOUND: "WHATSAPP_CONNECTION_ATTEMPT_NOT_FOUND",
  WEBHOOK_INVALID_SIGNATURE: "WHATSAPP_WEBHOOK_INVALID_SIGNATURE",
  WEBHOOK_MALFORMED_PAYLOAD: "WHATSAPP_WEBHOOK_MALFORMED_PAYLOAD",
  WEBHOOK_CONNECTION_NOT_FOUND: "WHATSAPP_WEBHOOK_CONNECTION_NOT_FOUND",
  WEBHOOK_DUPLICATE_EVENT: "WHATSAPP_WEBHOOK_DUPLICATE_EVENT",
  WEBHOOK_UNSUPPORTED_EVENT: "WHATSAPP_WEBHOOK_UNSUPPORTED_EVENT",
  WEBHOOK_VERIFY_FAILED: "WHATSAPP_WEBHOOK_VERIFY_FAILED",
  CONVERSATION_NOT_FOUND: "WHATSAPP_CONVERSATION_NOT_FOUND",
  INBOUND_CUSTOMER_MISSING: "WHATSAPP_INBOUND_CUSTOMER_MISSING",
  INBOUND_MATERIALIZATION_FAILED: "WHATSAPP_INBOUND_MATERIALIZATION_FAILED",
  CONVERSATION_CONNECTION_INACTIVE: "WHATSAPP_CONVERSATION_CONNECTION_INACTIVE",
  WEBHOOK_NOT_ACTIVE: "WHATSAPP_WEBHOOK_NOT_ACTIVE",
  CUSTOMER_SERVICE_WINDOW_CLOSED: "WHATSAPP_CUSTOMER_SERVICE_WINDOW_CLOSED",
  CUSTOMER_SERVICE_WINDOW_UNKNOWN: "WHATSAPP_CUSTOMER_SERVICE_WINDOW_UNKNOWN",
  SEND_REJECTED: "WHATSAPP_SEND_REJECTED",
  SEND_OUTCOME_UNKNOWN: "WHATSAPP_SEND_OUTCOME_UNKNOWN",
  SEND_RATE_LIMITED: "WHATSAPP_SEND_RATE_LIMITED",
  SEND_AUTH_FAILED: "WHATSAPP_SEND_AUTH_FAILED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  INVALID_TEXT: "WHATSAPP_INVALID_TEXT",
  MEDIA_UNAVAILABLE: "WHATSAPP_MEDIA_UNAVAILABLE",
  MEDIA_INVALID_TYPE: "WHATSAPP_MEDIA_INVALID_TYPE",
  MEDIA_TOO_LARGE: "WHATSAPP_MEDIA_TOO_LARGE",
  TEMPLATE_NOT_APPROVED: "WHATSAPP_TEMPLATE_NOT_APPROVED",
  TEMPLATE_NOT_FOUND: "WHATSAPP_TEMPLATE_NOT_FOUND",
  TEMPLATE_PARAMETERS_INVALID: "WHATSAPP_TEMPLATE_PARAMETERS_INVALID",
  EMBEDDED_SIGNUP_NOT_CONFIGURED: "WHATSAPP_EMBEDDED_SIGNUP_NOT_CONFIGURED",
  CUSTOMER_MATCH_AMBIGUOUS: "WHATSAPP_CUSTOMER_MATCH_AMBIGUOUS",
  CUSTOMER_NOT_FOUND: "WHATSAPP_CUSTOMER_NOT_FOUND",
} as const;

const R = WhatsAppErrorReason;

export const whatsappError = {
  providerNotConfigured: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp provider is not configured",
      R.PROVIDER_NOT_CONFIGURED,
    ),
  attemptExpired: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp connection attempt has expired",
      R.CONNECTION_ATTEMPT_EXPIRED,
    ),
  attemptUsed: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp connection attempt has already been used",
      R.CONNECTION_ATTEMPT_USED,
    ),
  providerAuthFailed: (providerErrorCode?: string) =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp provider authorization failed",
      R.PROVIDER_AUTH_FAILED,
      providerErrorCode ? { providerErrorCode } : undefined,
    ),
  wabaNotGranted: () =>
    err(
      ErrorCode.CONFLICT,
      "Selected WhatsApp Business Account was not granted by Meta",
      R.WABA_NOT_GRANTED,
    ),
  phoneNotGranted: () =>
    err(
      ErrorCode.CONFLICT,
      "Selected WhatsApp phone number was not granted by Meta",
      R.PHONE_NOT_GRANTED,
    ),
  validationFailed: (providerErrorCode?: string) =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp connection could not be validated",
      R.CONNECTION_VALIDATION_FAILED,
      providerErrorCode ? { providerErrorCode } : undefined,
    ),
  connectionNotFound: () =>
    err(ErrorCode.NOT_FOUND, "WhatsApp connection was not found", R.CONNECTION_NOT_FOUND),
  alreadyChanged: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp connection was changed by another request",
      R.CONNECTION_ALREADY_CHANGED,
    ),
  attemptNotFound: () =>
    err(
      ErrorCode.NOT_FOUND,
      "WhatsApp connection attempt was not found",
      R.CONNECTION_ATTEMPT_NOT_FOUND,
    ),
  conversationNotFound: () =>
    err(
      ErrorCode.NOT_FOUND,
      "WhatsApp conversation was not found",
      R.CONVERSATION_NOT_FOUND,
    ),
  conversationConnectionInactive: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp conversation is not on the active office connection",
      R.CONVERSATION_CONNECTION_INACTIVE,
    ),
  webhookNotActive: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp inbound webhook is not active",
      R.WEBHOOK_NOT_ACTIVE,
    ),
  customerServiceWindowClosed: () =>
    err(
      ErrorCode.CONFLICT,
      "The 24-hour WhatsApp customer service window has ended",
      R.CUSTOMER_SERVICE_WINDOW_CLOSED,
    ),
  customerServiceWindowUnknown: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp customer service window cannot be verified",
      R.CUSTOMER_SERVICE_WINDOW_UNKNOWN,
    ),
  sendRejected: (providerErrorCode?: string) =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp provider rejected the message",
      R.SEND_REJECTED,
      providerErrorCode ? { providerErrorCode } : undefined,
    ),
  sendOutcomeUnknown: (providerErrorCode?: string) =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp send outcome is uncertain",
      R.SEND_OUTCOME_UNKNOWN,
      providerErrorCode ? { providerErrorCode } : undefined,
    ),
  sendRateLimited: (providerErrorCode?: string) =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp send was rate limited",
      R.SEND_RATE_LIMITED,
      providerErrorCode ? { providerErrorCode } : undefined,
    ),
  sendAuthFailed: (providerErrorCode?: string) =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp send authorization failed",
      R.SEND_AUTH_FAILED,
      providerErrorCode ? { providerErrorCode } : undefined,
    ),
  noActiveConnection: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp conversation is not on the active office connection",
      R.CONVERSATION_CONNECTION_INACTIVE,
    ),
  idempotencyKeyReused: () =>
    err(
      ErrorCode.CONFLICT,
      "Idempotency key was reused with a different request",
      R.IDEMPOTENCY_KEY_REUSED,
    ),
  idempotencyKeyRequired: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "An idempotency key is required",
      R.IDEMPOTENCY_KEY_REQUIRED,
    ),
  invalidText: () =>
    err(ErrorCode.VALIDATION_ERROR, "WhatsApp message text is invalid", R.INVALID_TEXT),
  mediaUnavailable: () =>
    err(ErrorCode.NOT_FOUND, "WhatsApp media is not available", R.MEDIA_UNAVAILABLE),
  mediaInvalidType: () =>
    err(ErrorCode.VALIDATION_ERROR, "WhatsApp media type is not allowed", R.MEDIA_INVALID_TYPE),
  mediaTooLarge: () =>
    new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: "WhatsApp media exceeds the allowed size",
      statusCode: 413,
      context: { reason: R.MEDIA_TOO_LARGE },
    }),
  templateNotApproved: () =>
    err(ErrorCode.CONFLICT, "WhatsApp template is not approved for sending", R.TEMPLATE_NOT_APPROVED),
  templateNotFound: () =>
    err(ErrorCode.NOT_FOUND, "WhatsApp template was not found", R.TEMPLATE_NOT_FOUND),
  templateParametersInvalid: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "WhatsApp template parameters are invalid",
      R.TEMPLATE_PARAMETERS_INVALID,
    ),
  embeddedSignupNotConfigured: () =>
    err(
      ErrorCode.CONFLICT,
      "WhatsApp Embedded Signup is not configured",
      R.EMBEDDED_SIGNUP_NOT_CONFIGURED,
    ),
  customerMatchAmbiguous: () =>
    err(
      ErrorCode.CONFLICT,
      "Multiple Diamond customers match this WhatsApp identity",
      R.CUSTOMER_MATCH_AMBIGUOUS,
    ),
  customerNotFound: () =>
    err(ErrorCode.NOT_FOUND, "Diamond customer was not found", R.CUSTOMER_NOT_FOUND),
};
