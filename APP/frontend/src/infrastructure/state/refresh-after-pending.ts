/**
 * Guarantees that a refresh started after a successful mutation performs a
 * request after any older in-flight read has settled.
 *
 * Domain stores still own request deduplication through `run`. Concurrent
 * callers therefore share the same new read, while an older snapshot can no
 * longer satisfy the post-mutation refresh.
 */
export async function refreshAfterPending(
  getPending: () => Promise<void> | null,
  run: () => Promise<void>,
): Promise<void> {
  const pending = getPending();
  if (pending) {
    try {
      await pending;
    } catch {
      // The new request below is authoritative even when the older read failed.
    }
  }

  await run();
}
