const MAX_ENTRIES = 200;
const TTL_MS = 5 * 60 * 1000;

type CacheEntry = { body: Buffer; contentType: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function cacheKey(connectionId: string, conversationId: string): string {
  return `${connectionId}:${conversationId}`;
}

export function readCachedConversationAvatar(
  connectionId: string,
  conversationId: string,
): { body: Buffer; contentType: string } | null {
  const key = cacheKey(connectionId, conversationId);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return { body: hit.body, contentType: hit.contentType };
}

export function writeCachedConversationAvatar(
  connectionId: string,
  conversationId: string,
  body: Buffer,
  contentType: string,
): void {
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(cacheKey(connectionId, conversationId), {
    body,
    contentType,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function clearAvatarCacheForTests(): void {
  if (process.env.NODE_ENV === "production") return;
  cache.clear();
}
