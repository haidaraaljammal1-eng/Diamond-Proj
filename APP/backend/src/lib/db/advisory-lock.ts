import { createHash } from "node:crypto";
import type { Tx } from "src/lib/db/transaction";

/**
 * PostgreSQL transaction-scoped advisory locks for concurrency-sensitive
 * operations (capacity checks, unique allocation, reassignment, resource
 * reservation, critical status transitions).
 *
 * Rules:
 *  - Always acquire INSIDE a transaction (locks auto-release at tx end).
 *  - Use a stable namespace + stable entity id.
 *  - When taking multiple locks, acquire them in a deterministic sorted order
 *    (acquireAdvisoryLocks does this) to avoid deadlocks.
 *
 * Do NOT lock on every operation — only where correctness needs serialization.
 */
export type LockKey = [number, number];

export function advisoryLockKey(namespace: string, entityId: string | number): LockKey {
  const digest = createHash("sha256").update(`${namespace}:${entityId}`).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export async function acquireAdvisoryLock(
  tx: Tx,
  namespace: string,
  entityId: string | number,
): Promise<void> {
  const [a, b] = advisoryLockKey(namespace, entityId);
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1, $2)", a, b);
}

export async function acquireAdvisoryLocks(
  tx: Tx,
  locks: Array<{ namespace: string; entityId: string | number }>,
): Promise<void> {
  const keys = locks
    .map((l) => advisoryLockKey(l.namespace, l.entityId))
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (const [a, b] of keys) {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1, $2)", a, b);
  }
}
