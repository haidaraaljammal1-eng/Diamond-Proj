import {
  isWhapiDirectChatId,
  isWhapiGroupChatId,
} from "src/modules/whatsapp/whapi.chat-id";

/** Stable skip / failure codes stored on sync runs (no PII). */
export const WHAPI_HISTORY_CHAT_SKIP = {
  MESSAGES_LIST_UNSUPPORTED: "WHATSAPP_HISTORY_SYNC_CHAT_MESSAGES_UNSUPPORTED",
  MESSAGES_LIST_NOT_FOUND: "WHATSAPP_HISTORY_SYNC_CHAT_MESSAGES_NOT_FOUND",
  UNSUPPORTED_CHAT_ID: "WHATSAPP_HISTORY_SYNC_CHAT_UNSUPPORTED_ID",
  MESSAGES_LIST_INVALID_REQUEST: "WHATSAPP_HISTORY_SYNC_CHAT_MESSAGES_INVALID_REQUEST",
} as const;

export type WhapiHistoryMessagesListKind =
  | "ok"
  | "empty"
  | "skip_chat"
  | "auth_error"
  | "provider_error";

export type WhapiHistoryMessagesListClassification =
  | { kind: "ok" | "empty" }
  | { kind: "skip_chat"; reasonCode: string }
  | { kind: "auth_error" }
  | { kind: "provider_error" };

function isBroadcastOrNewsletterChatId(chatId: string): boolean {
  const lower = chatId.toLowerCase();
  return (
    lower.includes("@broadcast") ||
    lower.includes("newsletter") ||
    lower.endsWith("@newsletter") ||
    lower === "status@broadcast"
  );
}

/**
 * Classify Whapi `GET /messages/list/{chatId}` HTTP results.
 * Live QA: some listable `/chats` rows return 400 — treat as unsupported chat, not empty history.
 */
export function classifyWhapiMessagesListHttpStatus(
  status: number,
  chatId: string,
): WhapiHistoryMessagesListClassification {
  if (status === 401 || status === 403) return { kind: "auth_error" };
  if (status === 404) {
    return { kind: "skip_chat", reasonCode: WHAPI_HISTORY_CHAT_SKIP.MESSAGES_LIST_NOT_FOUND };
  }
  if (status === 400) {
    if (isWhapiGroupChatId(chatId) || isBroadcastOrNewsletterChatId(chatId)) {
      return { kind: "skip_chat", reasonCode: WHAPI_HISTORY_CHAT_SKIP.UNSUPPORTED_CHAT_ID };
    }
    if (!isWhapiDirectChatId(chatId)) {
      return { kind: "skip_chat", reasonCode: WHAPI_HISTORY_CHAT_SKIP.UNSUPPORTED_CHAT_ID };
    }
    return { kind: "skip_chat", reasonCode: WHAPI_HISTORY_CHAT_SKIP.MESSAGES_LIST_UNSUPPORTED };
  }
  if (status >= 200 && status < 300) return { kind: "ok" };
  if (status === 429 || status >= 500) return { kind: "provider_error" };
  return { kind: "provider_error" };
}
