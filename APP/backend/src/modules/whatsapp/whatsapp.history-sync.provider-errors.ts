/** Whapi history list HTTP failures use `whapi_{chats|messages}_http_{status}`. */
export function isWhapiHistoryAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /^whapi_(?:chats|messages)_http_(401|403)$/.test(err.message);
}

export function isRetriableWhapiHistoryError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const match = /^whapi_(?:chats|messages)_http_(\d+)$/.exec(err.message);
  if (!match) return false;
  const status = Number.parseInt(match[1]!, 10);
  return status === 429 || status >= 500;
}

export function whapiHistoryHttpError(resource: "chats" | "messages", status: number): Error {
  return new Error(`whapi_${resource}_http_${status}`);
}
