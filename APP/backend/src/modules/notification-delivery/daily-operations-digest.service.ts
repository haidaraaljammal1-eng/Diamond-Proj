import type { PrismaClient } from "@prisma/client";
import { env } from "src/config/env";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import {
  buildAttentionMonitorRunKey,
  formatLocalDateParts,
  parseAttentionMonitorTimes,
} from "src/modules/notification-delivery/attention-monitor.service";
import { DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";
import { buildDailyOperationsDigestMessage } from "src/modules/notification-delivery/business-notification.messages";
import {
  DIGEST_INFLIGHT_STALE_MS,
  DIGEST_SENT_REF,
  DIGEST_SKIPPED_EMPTY_REF,
  digestFailedRef,
  digestInflightRef,
  isDigestFailedRef,
  isDigestInflightStale,
  isDigestTerminalRef,
  listReachedDigestSlots,
} from "src/modules/notification-delivery/daily-operations-digest.delivery-state";
import { loadDailyOperationsDigestSnapshot } from "src/modules/notification-delivery/daily-operations-digest.queries";
import {
  dailyOperationsDigestHasOutstanding,
  type DailyOperationsDigestSnapshot,
} from "src/modules/notification-delivery/daily-operations-digest.types";
import { notificationService } from "src/modules/notification-delivery/notification.service";
import type { NotificationSendResult } from "src/modules/notification-delivery/notification.types";

type DigestSend = (payload: {
  title: string;
  message: string;
  inAppDedupeKey?: string;
}) => Promise<NotificationSendResult>;

export interface DailyOperationsDigestCycleOptions {
  enabled: boolean;
  timeZone: string;
  monitorTimes: string;
  now: Date;
  /** Override stale inflight window (tests). */
  inflightStaleMs?: number;
}

async function readDigestKey(prisma: PrismaClient, runKey: string) {
  return prisma.idempotencyKey.findUnique({
    where: {
      scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey },
    },
  });
}

/**
 * Atomically claim a slot for delivery. Returns false when another worker owns
 * a fresh inflight claim or the slot is already terminal.
 */
export async function claimDailyOperationsDigestSlot(
  prisma: PrismaClient,
  runKey: string,
  nowMs: number,
  staleMs = DIGEST_INFLIGHT_STALE_MS,
): Promise<{ claimed: boolean; inflightRef: string | null }> {
  const inflight = digestInflightRef(nowMs);

  try {
    await prisma.idempotencyKey.create({
      data: {
        scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE,
        key: runKey,
        resultRef: inflight,
      },
    });
    return { claimed: true, inflightRef: inflight };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  const existing = await readDigestKey(prisma, runKey);
  if (!existing) return { claimed: false, inflightRef: null };
  if (isDigestTerminalRef(existing.resultRef)) {
    return { claimed: false, inflightRef: null };
  }

  const canReclaim =
    isDigestFailedRef(existing.resultRef) ||
    isDigestInflightStale(existing.resultRef, nowMs, staleMs);

  if (!canReclaim || existing.resultRef == null) {
    return { claimed: false, inflightRef: null };
  }

  const updated = await prisma.idempotencyKey.updateMany({
    where: {
      scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE,
      key: runKey,
      resultRef: existing.resultRef,
    },
    data: { resultRef: inflight },
  });

  if (updated.count !== 1) return { claimed: false, inflightRef: null };
  return { claimed: true, inflightRef: inflight };
}

async function finalizeClaimedDigest(
  prisma: PrismaClient,
  runKey: string,
  expectedInflightRef: string,
  nextRef: string,
): Promise<boolean> {
  const updated = await prisma.idempotencyKey.updateMany({
    where: {
      scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE,
      key: runKey,
      resultRef: expectedInflightRef,
    },
    data: { resultRef: nextRef },
  });
  return updated.count === 1;
}

async function pickAndClaimNextSlot(
  prisma: PrismaClient,
  options: DailyOperationsDigestCycleOptions,
): Promise<{ runKey: string; slot: string; inflightRef: string } | null> {
  const slots = parseAttentionMonitorTimes(options.monitorTimes);
  if (slots.length === 0) return null;

  const { dateKey, timeKey } = formatLocalDateParts(options.now, options.timeZone);
  const reached = listReachedDigestSlots(timeKey, slots);
  const nowMs = options.now.getTime();
  const staleMs = options.inflightStaleMs ?? DIGEST_INFLIGHT_STALE_MS;

  for (const slot of reached) {
    const runKey = buildAttentionMonitorRunKey(dateKey, slot, options.timeZone);
    const existing = await readDigestKey(prisma, runKey);
    if (existing && isDigestTerminalRef(existing.resultRef)) continue;

    const claim = await claimDailyOperationsDigestSlot(prisma, runKey, nowMs, staleMs);
    if (!claim.claimed || !claim.inflightRef) continue;

    return { runKey, slot, inflightRef: claim.inflightRef };
  }

  return null;
}

/**
 * Unified digest cycle. Claims at most one reached-but-incomplete Dubai slot
 * per tick, reloads a fresh snapshot, and records durable delivery state.
 *
 * Note: `runIdempotent` is intentionally not used — it cannot reopen a key after
 * a failed side effect. This cycle uses claim → send → terminal/failed refs.
 */
export async function runDailyOperationsDigestCycle(
  prisma: PrismaClient,
  options: DailyOperationsDigestCycleOptions,
  send: DigestSend = notificationService.send.bind(notificationService),
  loadSnapshot: (
    prisma: PrismaClient,
    now: Date,
  ) => Promise<DailyOperationsDigestSnapshot> = loadDailyOperationsDigestSnapshot,
): Promise<boolean> {
  if (!options.enabled) return false;

  const claim = await pickAndClaimNextSlot(prisma, options);
  if (!claim) return false;

  try {
    const snapshot = await loadSnapshot(prisma, options.now);
    if (!dailyOperationsDigestHasOutstanding(snapshot)) {
      await finalizeClaimedDigest(
        prisma,
        claim.runKey,
        claim.inflightRef,
        DIGEST_SKIPPED_EMPTY_REF,
      );
      return false;
    }

    const message = buildDailyOperationsDigestMessage(snapshot);
    const result = await send({
      ...message,
      inAppDedupeKey: `daily-operations-digest:${claim.runKey}`,
    });
    if (!result.success) {
      await finalizeClaimedDigest(
        prisma,
        claim.runKey,
        claim.inflightRef,
        digestFailedRef(options.now.getTime()),
      );
      return false;
    }

    await finalizeClaimedDigest(prisma, claim.runKey, claim.inflightRef, DIGEST_SENT_REF);
    return true;
  } catch (err) {
    await finalizeClaimedDigest(
      prisma,
      claim.runKey,
      claim.inflightRef,
      digestFailedRef(options.now.getTime()),
    ).catch(() => undefined);
    throw err;
  }
}

export function createDailyOperationsDigestService(app: { prisma: PrismaClient }) {
  return {
    runDueCycle(now = new Date()) {
      return runDailyOperationsDigestCycle(app.prisma, {
        enabled: env.DAILY_OPERATIONS_DIGEST_ENABLED,
        timeZone: env.ATTENTION_MONITOR_TIMEZONE,
        monitorTimes: env.DAILY_OPERATIONS_DIGEST_TIMES,
        now,
      });
    },
  };
}
