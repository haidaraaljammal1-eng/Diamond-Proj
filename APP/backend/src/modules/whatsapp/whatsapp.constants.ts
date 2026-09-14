export const WHATSAPP_PROVIDER = "META_CLOUD_API" as const;

export const WHATSAPP_CONNECTION_LOCK_NS = "whatsapp_connection";
export const WHATSAPP_CONVERSATION_LOCK_NS = "whatsapp_conversation";
export const WHATSAPP_OFFICE_LOCK_ID = "office";

/** Connection-attempt TTL. Short-lived CSRF/OAuth state (10 minutes). */
export const WHATSAPP_CONNECTION_ATTEMPT_TTL_SECONDS = 600;

export const WHATSAPP_CREDENTIAL_PREFIX = "enc:v1:";

export const WHATSAPP_MESSAGE_PREVIEW_MAX = 160;

/** Official Cloud API text body maximum (characters). Do not invent another cap. */
export const WHATSAPP_TEXT_BODY_MAX = 4096;

/**
 * Official Cloud API media caption maximum for image/video/document.
 * Audio has no caption in the Cloud API send contract.
 */
export const WHATSAPP_MEDIA_CAPTION_MAX = 1024;

/**
 * Official Cloud API media size limits (bytes). Outbound also respects
 * `MAX_UPLOAD_SIZE` (the more restrictive bound wins).
 * Source: WhatsApp Cloud API media documentation.
 */
export const WHATSAPP_MEDIA_MAX_BYTES = {
  IMAGE: 5 * 1024 * 1024,
  VIDEO: 16 * 1024 * 1024,
  AUDIO: 16 * 1024 * 1024,
  DOCUMENT: 100 * 1024 * 1024,
} as const;

export const WHATSAPP_PROTECTED_MEDIA_TYPES = [
  "IMAGE",
  "DOCUMENT",
  "AUDIO",
  "VIDEO",
  "STICKER",
] as const;

export const WHATSAPP_OUTBOUND_MEDIA_TYPES = ["IMAGE", "DOCUMENT", "AUDIO", "VIDEO"] as const;

/** Absolute customer-service window from last valid inbound providerOccurredAt. */
export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const WHATSAPP_IDEMPOTENCY_SCOPE = "whatsapp.send";

/** SSE is notification-only. REST/DB remain source of truth. */
export const WHATSAPP_REALTIME_EVENT_PREFIX = "whatsapp.";
export const WHATSAPP_REALTIME_HEARTBEAT_MS = 15_000;
export const WHATSAPP_REALTIME_FANOUT_MS = 1_000;
/** Bounded outbox retention for replay. Not a second message archive. */
export const WHATSAPP_REALTIME_RETENTION_MS = 15 * 60_000;
export const WHATSAPP_REALTIME_MAX_SUBSCRIBERS = 40;

export const WHATSAPP_AUDIT = {
  ATTEMPT_STARTED: "WHATSAPP_CONNECTION_ATTEMPT_STARTED",
  PROVIDER_AUTHORIZED: "WHATSAPP_PROVIDER_AUTHORIZED",
  CONNECTION_LINKED: "WHATSAPP_CONNECTION_LINKED",
  CONNECTION_CHANGED: "WHATSAPP_CONNECTION_CHANGED",
  CONNECTION_DISCONNECTED: "WHATSAPP_CONNECTION_DISCONNECTED",
  CONNECTION_FAILED: "WHATSAPP_CONNECTION_FAILED",
  WEBHOOK_SUBSCRIBED: "WHATSAPP_WEBHOOK_SUBSCRIBED",
  WEBHOOK_VALIDATION_FAILED: "WHATSAPP_WEBHOOK_VALIDATION_FAILED",
  CONVERSATION_READ: "WHATSAPP_CONVERSATION_READ",
  MESSAGE_SEND_ATTEMPTED: "WHATSAPP_MESSAGE_SEND_ATTEMPTED",
  MESSAGE_SEND_ACCEPTED: "WHATSAPP_MESSAGE_SEND_ACCEPTED",
  MESSAGE_SEND_FAILED: "WHATSAPP_MESSAGE_SEND_FAILED",
  WEBHOOK_ACTIVATED: "WHATSAPP_WEBHOOK_ACTIVATED",
  CUSTOMER_LINKED: "WHATSAPP_CUSTOMER_LINKED",
  CUSTOMER_UNLINKED: "WHATSAPP_CUSTOMER_UNLINKED",
} as const;

export const WHATSAPP_CURRENT_STATUSES = [
  "LINKED",
  "LINKING",
  "REAUTH_REQUIRED",
  "ERROR",
] as const;

export const WHATSAPP_MAX_WABAS = 50;
export const WHATSAPP_MAX_PHONE_PAGES = 10;
