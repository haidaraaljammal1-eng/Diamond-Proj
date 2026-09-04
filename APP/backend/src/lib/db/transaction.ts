import type { Prisma, PrismaClient } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Run multi-step writes atomically. Any operation that touches more than one
 * row/table and must be all-or-nothing belongs inside `withTransaction`. Pair
 * with `acquireAdvisoryLock` for concurrency-sensitive sections.
 *
 *   validate → lock → re-read → update → related write → (audit) — all in one tx.
 */
export function withTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, options);
}
