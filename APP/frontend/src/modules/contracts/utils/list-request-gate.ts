/**
 * Latest-wins gate for the Contracts list request.
 *
 * A request for the same query joins the one already in flight. A request for
 * a different query (new filter, page, sort) starts immediately and marks the
 * older one stale, so a slow background refresh can never overwrite the rows
 * of a newer query.
 */
export interface ListRequestGate {
  run(key: string, task: (isCurrent: () => boolean) => Promise<void>): Promise<void>;
  /** The request in flight, if any. */
  current(): Promise<void> | null;
}

export function createListRequestGate(): ListRequestGate {
  let sequence = 0;
  let inFlight: { key: string; promise: Promise<void> } | null = null;

  return {
    run(key, task) {
      if (inFlight && inFlight.key === key) return inFlight.promise;
      const id = ++sequence;
      const entry: { key: string; promise: Promise<void> } = { key, promise: Promise.resolve() };
      entry.promise = task(() => id === sequence).finally(() => {
        if (inFlight === entry) inFlight = null;
      });
      inFlight = entry;
      return entry.promise;
    },
    current() {
      return inFlight?.promise ?? null;
    },
  };
}
