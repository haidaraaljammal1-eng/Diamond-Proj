import type { GpsAcceptedPositionEvent, GpsAcceptedPositionObserver } from "src/modules/gps/gps.types";

const observers = new Set<GpsAcceptedPositionObserver>();

export function registerGpsAcceptedPositionObserver(
  observer: GpsAcceptedPositionObserver,
): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}

/**
 * Notify observers of an accepted GPS ingest. Failures are isolated per observer
 * so GPS latest-state persistence is never rolled back.
 */
export async function notifyGpsAcceptedPosition(event: GpsAcceptedPositionEvent): Promise<void> {
  const tasks = [...observers].map(async (observer) => {
    try {
      await observer.onAcceptedPosition(event);
    } catch {
      // Swallow: GPS ingest must not fail because an observer failed.
    }
  });
  await Promise.all(tasks);
}
