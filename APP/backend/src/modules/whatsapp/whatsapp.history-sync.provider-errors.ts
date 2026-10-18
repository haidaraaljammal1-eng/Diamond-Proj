import { WhapiHttpError } from "src/modules/whatsapp/providers/whapi.client";

/** Whapi history list HTTP failures use `whapi_{chats|messages|groups}_http_{status}`. */
export function isWhapiHistoryAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /^whapi_(?:chats|messages|groups)_http_(401|403)$/.test(err.message);
}

export function isWhapiHistoryNetworkError(err: unknown): boolean {
  if (err instanceof WhapiHttpError) return true;
  return err instanceof Error && err.message === "whapi_http_error";
}

export function isRetriableWhapiHistoryError(err: unknown): boolean {
  if (isWhapiHistoryNetworkError(err)) return true;
  if (!(err instanceof Error)) return false;
  const match = /^whapi_(?:chats|messages|groups)_http_(\d+)$/.exec(err.message);
  if (!match) return false;
  const status = Number.parseInt(match[1]!, 10);
  return status === 429 || status >= 500;
}

export function whapiHistoryHttpError(
  resource: "chats" | "messages" | "groups",
  status: number,
): Error {
  return new Error(`whapi_${resource}_http_${status}`);
}

export function historySyncFailureCode(err: unknown): string {
  if (isWhapiHistoryAuthError(err)) return "WHATSAPP_HISTORY_SYNC_PROVIDER_AUTH";
  if (isWhapiHistoryNetworkError(err)) return "WHATSAPP_HISTORY_SYNC_PROVIDER_NETWORK";
  if (err instanceof Error) {
    const http = /^whapi_(?:chats|messages|groups)_http_(\d+)$/.exec(err.message);
    if (http) {
      const status = Number.parseInt(http[1]!, 10);
      if (status === 429) return "WHATSAPP_HISTORY_SYNC_PROVIDER_RATE_LIMITED";
      if (status >= 500) return "WHATSAPP_HISTORY_SYNC_PROVIDER_UNAVAILABLE";
      return "WHATSAPP_HISTORY_SYNC_PROVIDER_ERROR";
    }
    if (err.message.startsWith("whapi_")) return "WHATSAPP_HISTORY_SYNC_PROVIDER_ERROR";
  }
  return "WHATSAPP_HISTORY_SYNC_FAILED";
}
