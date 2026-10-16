export interface CustomerMatchLoader<T> {
  load(conversationId: string): Promise<T>;
  invalidate(conversationId?: string): void;
}

const RATE_LIMIT_BLOCK_MS = 60_000;

function statusOf(error: unknown): number {
  if (typeof error !== "object" || error === null || !("status" in error)) return 0;
  const status = Number((error as { status: unknown }).status);
  return Number.isFinite(status) ? status : 0;
}

/**
 * One match request per conversation until Refresh, link, or unlink.
 * Identical callers share the in-flight promise. A 429 is not retried until
 * invalidate() — Refresh does that. The phone suggestion does not change when
 * a realtime preview changes, so those updates must not call this again.
 */
export function createCustomerMatchLoader<T>(
  fetchMatch: (conversationId: string) => Promise<T>,
  options?: { now?: () => number; blockMs?: number },
): CustomerMatchLoader<T> {
  const now = options?.now ?? Date.now;
  const blockMs = options?.blockMs ?? RATE_LIMIT_BLOCK_MS;
  const cache = new Map<string, T>();
  const inflight = new Map<string, Promise<T>>();
  const blockedUntil = new Map<string, number>();
  const generation = new Map<string, number>();

  function bump(conversationId: string) {
    generation.set(conversationId, (generation.get(conversationId) ?? 0) + 1);
  }

  function invalidate(conversationId?: string) {
    if (!conversationId) {
      for (const id of new Set([...cache.keys(), ...inflight.keys(), ...generation.keys()])) {
        bump(id);
      }
      cache.clear();
      inflight.clear();
      blockedUntil.clear();
      return;
    }
    bump(conversationId);
    cache.delete(conversationId);
    inflight.delete(conversationId);
    blockedUntil.delete(conversationId);
  }

  function load(conversationId: string): Promise<T> {
    const cached = cache.get(conversationId);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inflight.get(conversationId);
    if (pending) return pending;
    const until = blockedUntil.get(conversationId);
    if (until !== undefined && now() < until) {
      return Promise.reject(Object.assign(new Error("customer match blocked"), { status: 429 }));
    }
    const gen = generation.get(conversationId) ?? 0;
    const request = fetchMatch(conversationId)
      .then((match) => {
        if ((generation.get(conversationId) ?? 0) !== gen) return match;
        cache.set(conversationId, match);
        blockedUntil.delete(conversationId);
        return match;
      })
      .catch((error: unknown) => {
        if ((generation.get(conversationId) ?? 0) === gen && statusOf(error) === 429) {
          blockedUntil.set(conversationId, now() + blockMs);
        }
        throw error;
      })
      .finally(() => {
        if (inflight.get(conversationId) === request) inflight.delete(conversationId);
      });
    inflight.set(conversationId, request);
    return request;
  }

  return { load, invalidate };
}
