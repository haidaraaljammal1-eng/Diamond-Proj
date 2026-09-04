import type { CallQueueStatus } from "@prisma/client";

/** Queue statuses that close out a follow-up — reused by call-center (claim
 *  guards) AND the queue readers, so the modules can
 *  never define "resolved" differently. */
export const CALL_QUEUE_TERMINAL_STATUSES: CallQueueStatus[] = [
  "COMPLETED",
  "UNREACHABLE",
  "REFUSED",
  "INVALID_CONTACT",
  "CANCELLED",
];

/**
 * Central, overridable call-center settings. Retry/attempt behaviour is defined
 * here ONCE (never hardcoded across the service) so it can be tuned via env.
 */
export const CALL_CENTER_CONFIG = {
  /** Unanswered attempts (NO_ANSWER/PHONE_OFF/BUSY) before → UNREACHABLE. */
  maxUnansweredAttempts: Number(process.env.CALL_CENTER_MAX_UNANSWERED_ATTEMPTS ?? 3),
  /** Default minutes to the next retry when the agent does not pick a time. */
  defaultRetryDelayMinutes: Number(process.env.CALL_CENTER_RETRY_DELAY_MINUTES ?? 120),
  /** Hours a queue item may sit untouched before it is treated as stale. */
  staleQueueItemHours: Number(process.env.CALL_CENTER_STALE_QUEUE_ITEM_HOURS ?? 48),
  /** Hard bound for the queue export (structured error, never silent truncation). */
  exportLimit: 10_000,
  /** Max length of an internal note. */
  internalNoteMaxLength: 2000,
  /** TTL of a short-lived signed recording-access token. */
  recordingAccessTtlSeconds: 300,
} as const;
