/**
 * Delivery-state protocol for Daily Operations & Receivables.
 *
 * `runIdempotent` is create-first and treats any unique hit as permanent dedupe,
 * so it cannot recover a failed Pushover send. This module keeps a durable
 * IdempotencyKey row per slot and encodes lifecycle in `resultRef`:
 *
 * - digest:inflight:{epochMs}  — claim held by a worker
 * - digest:failed:{epochMs}    — last send failed; retryable
 * - digest:sent                — terminal success
 * - digest:skipped-empty       — terminal: slot evaluated, nothing to send
 *
 * Exactly-once cannot be guaranteed if the process dies after Pushover accepts
 * the message and before the row is marked `sent` (at-least-once recovery).
 */

export const DIGEST_SENT_REF = "digest:sent";
export const DIGEST_SKIPPED_EMPTY_REF = "digest:skipped-empty";
export const DIGEST_INFLIGHT_PREFIX = "digest:inflight:";
export const DIGEST_FAILED_PREFIX = "digest:failed:";

/** Fresh inflight claims younger than this are owned by another worker. */
export const DIGEST_INFLIGHT_STALE_MS = 2 * 60_000;

export function digestInflightRef(atMs = Date.now()): string {
  return `${DIGEST_INFLIGHT_PREFIX}${atMs}`;
}

export function digestFailedRef(atMs = Date.now()): string {
  return `${DIGEST_FAILED_PREFIX}${atMs}`;
}

export function isDigestTerminalRef(resultRef: string | null | undefined): boolean {
  return resultRef === DIGEST_SENT_REF || resultRef === DIGEST_SKIPPED_EMPTY_REF;
}

export function isDigestInflightRef(resultRef: string | null | undefined): boolean {
  return typeof resultRef === "string" && resultRef.startsWith(DIGEST_INFLIGHT_PREFIX);
}

export function isDigestFailedRef(resultRef: string | null | undefined): boolean {
  return typeof resultRef === "string" && resultRef.startsWith(DIGEST_FAILED_PREFIX);
}

export function parseDigestRefTimestamp(resultRef: string): number | null {
  const prefixes = [DIGEST_INFLIGHT_PREFIX, DIGEST_FAILED_PREFIX] as const;
  for (const prefix of prefixes) {
    if (!resultRef.startsWith(prefix)) continue;
    const raw = resultRef.slice(prefix.length);
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function isDigestInflightStale(
  resultRef: string | null | undefined,
  nowMs: number,
  staleMs = DIGEST_INFLIGHT_STALE_MS,
): boolean {
  if (!isDigestInflightRef(resultRef) || !resultRef) return false;
  const at = parseDigestRefTimestamp(resultRef);
  if (at == null) return true;
  return nowMs - at >= staleMs;
}

/** Local HH:MM comparison — slots use zero-padded 24h keys. */
export function localTimeKeyMinutes(timeKey: string): number {
  const [h, m] = timeKey.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  return h * 60 + m;
}

/**
 * Slots whose wall-clock time has already arrived today (inclusive),
 * earliest first. Enables retry after the scheduled minute ends without
 * inventing a new appointment — same date+slot key remains.
 */
export function listReachedDigestSlots(
  nowTimeKey: string,
  slots: string[],
): string[] {
  const nowMinutes = localTimeKeyMinutes(nowTimeKey);
  return slots
    .filter((slot) => localTimeKeyMinutes(slot) <= nowMinutes)
    .sort((a, b) => localTimeKeyMinutes(a) - localTimeKeyMinutes(b));
}
