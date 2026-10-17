export interface CustomerContextLoader<T> {
  load(conversationId: string): Promise<T>;
  invalidate(conversationId?: string): void;
}

/**
 * Loads linked customer context once per conversation until link/unlink or manual invalidate.
 * Realtime message previews must not refetch this payload.
 */
export function createCustomerContextLoader<T>(
  fetchContext: (conversationId: string) => Promise<T>,
): CustomerContextLoader<T> {
  const cache = new Map<string, T>();
  const inflight = new Map<string, Promise<T>>();

  function invalidate(conversationId?: string) {
    if (!conversationId) {
      cache.clear();
      inflight.clear();
      return;
    }
    cache.delete(conversationId);
    inflight.delete(conversationId);
  }

  function load(conversationId: string): Promise<T> {
    const cached = cache.get(conversationId);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inflight.get(conversationId);
    if (pending) return pending;
    const request = fetchContext(conversationId)
      .then((value) => {
        cache.set(conversationId, value);
        return value;
      })
      .finally(() => {
        if (inflight.get(conversationId) === request) inflight.delete(conversationId);
      });
    inflight.set(conversationId, request);
    return request;
  }

  return { load, invalidate };
}
