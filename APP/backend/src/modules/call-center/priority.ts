import type { CallQueuePriority, CallQueueSourceType } from "@prisma/client";

/**
 * Central call-queue priority model — the SINGLE source of ordering truth.
 * `priorityRank` is a stored key (lower = called sooner); every queue read/claim
 * orders by (priorityRank ASC, dueAt ASC, createdAt ASC). Do not duplicate this
 * ordering anywhere else.
 *
 * Bands (most urgent first → due callbacks → the rest):
 *   200 complaint follow-up
 *   300 scheduled callback
 *   450 manual (default) — a supervisor may override to a HIGH/LOW band
 */
const SOURCE_RANK: Record<CallQueueSourceType, number> = {
  COMPLAINT: 200,
  CALLBACK: 300,
  MANUAL: 450,
};

const SOURCE_PRIORITY: Record<CallQueueSourceType, CallQueuePriority> = {
  COMPLAINT: "HIGH",
  CALLBACK: "MEDIUM",
  MANUAL: "MEDIUM",
};

/** Rank band for a coarse HIGH/MEDIUM/LOW priority (used for manual overrides). */
const PRIORITY_RANK: Record<CallQueuePriority, number> = { HIGH: 150, MEDIUM: 450, LOW: 720 };

/** The coarse priority label for an item — an explicit override wins. */
export function priorityFor(sourceType: CallQueueSourceType, override?: CallQueuePriority | null): CallQueuePriority {
  return override ?? SOURCE_PRIORITY[sourceType];
}

/**
 * The stored ordering key. An explicit priority override (manual enqueue / supervisor)
 * maps to the coarse band; otherwise the source-type band drives ordering.
 */
export function priorityRankFor(sourceType: CallQueueSourceType, override?: CallQueuePriority | null): number {
  return override ? PRIORITY_RANK[override] : SOURCE_RANK[sourceType];
}

/** Stable Prisma orderBy for every eligible-queue read (central, never re-derived). */
export const QUEUE_ORDER_BY = [{ priorityRank: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }] as const;
