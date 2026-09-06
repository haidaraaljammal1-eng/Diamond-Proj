/**
 * Coordinates single-use refresh tokens.
 *
 * The Backend ROTATES refresh tokens: `/auth/refresh` returns a new pair and
 * rejects any reuse of the old one with `TOKEN_INVALID`. A page that fires more
 * than one request at once (a list plus a lookup) runs the NextAuth `jwt`
 * callback several times with the same stored token — the first rotates it and
 * the rest get a 401, which marks the whole session `RefreshAccessTokenError`
 * and forces a re-login every 15 minutes.
 *
 * The coordinator keys both maps by the OLD token: concurrent callers share one
 * in-flight request, and a token that was just rotated keeps answering with the
 * pair it produced for a short window, so a straggler still gets usable tokens.
 * A failed refresh is never cached — the next attempt must reach the Backend.
 */
export interface RefreshCoordinatorOptions {
  /** How long a rotated token keeps answering with its result. */
  ttlMs?: number;
  /** Injectable clock (tests). */
  now?: () => number;
}

const DEFAULT_TTL_MS = 60_000;

export function createRefreshCoordinator<T>(
  refresh: (token: string) => Promise<T>,
  options: RefreshCoordinatorOptions = {},
): (token: string) => Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  const inFlight = new Map<string, Promise<T>>();
  const results = new Map<string, { value: T; at: number }>();

  function prune(at: number): void {
    for (const [key, entry] of results) {
      if (at - entry.at > ttlMs) results.delete(key);
    }
  }

  return function coordinatedRefresh(token: string): Promise<T> {
    const at = now();
    prune(at);

    const cached = results.get(token);
    if (cached) return Promise.resolve(cached.value);

    const pending = inFlight.get(token);
    if (pending) return pending;

    const request = refresh(token)
      .then((value) => {
        results.set(token, { value, at: now() });
        return value;
      })
      .finally(() => {
        inFlight.delete(token);
      });

    inFlight.set(token, request);
    return request;
  };
}
