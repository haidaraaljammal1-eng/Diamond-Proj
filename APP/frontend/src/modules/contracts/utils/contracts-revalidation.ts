/** How often a visible Contracts page re-reads the list. Operational data, not live telemetry. */
export const CONTRACTS_REVALIDATE_INTERVAL_MS = 30_000;
/** Focus and visibilitychange usually fire together on a tab switch: collapse them into one refresh. */
export const CONTRACTS_REVALIDATE_MIN_GAP_MS = 2_000;

type Listener = () => void;

interface ListenerTarget {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
}

export interface RevalidationEnvironment {
  window: ListenerTarget;
  document: ListenerTarget & { readonly visibilityState: string };
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}

export interface RevalidationOptions {
  intervalMs?: number;
  minGapMs?: number;
}

/**
 * Re-reads Contracts changed outside this page (a customer paying through a
 * Rental Link, another staff session): on window focus, when the tab becomes
 * visible again, and on a slow poll while the tab is visible. Hidden tabs never
 * refresh. One refresh at a time; bursts inside `minGapMs` collapse into one.
 * Local staff mutations keep their own refresh after the mutation settles.
 *
 * Returns the cleanup that removes every listener and timer.
 */
export function startContractsRevalidation(
  refresh: () => Promise<void>,
  env: RevalidationEnvironment,
  { intervalMs = CONTRACTS_REVALIDATE_INTERVAL_MS, minGapMs = CONTRACTS_REVALIDATE_MIN_GAP_MS }: RevalidationOptions = {},
): () => void {
  let inFlight = false;
  let lastRun = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;

  const visible = () => env.document.visibilityState === "visible";

  function revalidate() {
    if (!visible() || inFlight) return;
    const now = env.now();
    if (now - lastRun < minGapMs) return;
    lastRun = now;
    inFlight = true;
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  }

  function startPolling() {
    if (timer === null) timer = env.setInterval(revalidate, intervalMs);
  }

  function stopPolling() {
    if (timer === null) return;
    env.clearInterval(timer);
    timer = null;
  }

  const onFocus = () => revalidate();
  const onVisibilityChange = () => {
    if (visible()) {
      revalidate();
      startPolling();
    } else {
      stopPolling();
    }
  };

  env.window.addEventListener("focus", onFocus);
  env.document.addEventListener("visibilitychange", onVisibilityChange);
  if (visible()) startPolling();

  return () => {
    env.window.removeEventListener("focus", onFocus);
    env.document.removeEventListener("visibilitychange", onVisibilityChange);
    stopPolling();
  };
}
