import type { PrismaClient } from "@prisma/client";
import { fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { PERMISSIONS } from "src/constants/permissions";
import type { NotifyService } from "src/plugins/notifications";

/** In-app mirror of successful shared Pushover staff alerts. */
export const PUSHOVER_IN_APP_EVENT_KEY = "pushover.staff_alert";

/** Retention window for mirrored Pushover inbox rows. */
export const PUSHOVER_IN_APP_TTL_MS = 48 * 60 * 60 * 1000;

export function pushoverInAppCutoff(now = new Date()): Date {
  return new Date(now.getTime() - PUSHOVER_IN_APP_TTL_MS);
}

export async function resolvePushoverInAppAudience(prisma: PrismaClient): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: {
        some: {
          role: {
            permissions: {
              some: { permission: { key: PERMISSIONS.NOTIFICATIONS_READ } },
            },
          },
        },
      },
    },
    select: { id: true },
  });
  return users.map((row) => row.id);
}

export interface MirrorSuccessfulPushoverInput {
  title: string;
  body: string;
  /** Stable business key (outbox idempotency / digest slot). */
  dedupeKey?: string;
  /** Provider request id fallback when no business key is supplied. */
  requestId?: string;
}

/**
 * After a successful Pushover send: fan-out one IN_APP row per authorized staff
 * user. Never throws to the caller — mirror failures must not affect Pushover.
 */
export async function mirrorSuccessfulPushoverToInApp(
  notify: NotifyService,
  prisma: PrismaClient,
  input: MirrorSuccessfulPushoverInput,
): Promise<void> {
  const userIds = await resolvePushoverInAppAudience(prisma);
  if (userIds.length === 0) return;

  const dedupeKeyPrefix = input.dedupeKey
    ? `pushover-mirror:${input.dedupeKey}`
    : input.requestId
      ? `pushover-mirror:req:${input.requestId}`
      : `pushover-mirror:content:${fingerprintIdempotentPayload({
          title: input.title,
          body: input.body,
        })}`;

  await notify.send({
    eventKey: PUSHOVER_IN_APP_EVENT_KEY,
    userIds,
    title: input.title,
    body: input.body,
    dedupeKeyPrefix,
    channels: ["IN_APP"],
    data: { source: "pushover" },
  });
}

/** Hard-delete expired mirrored Pushover inbox rows. */
export async function runPushoverInAppNotificationCleanup(
  prisma: PrismaClient,
  now = new Date(),
): Promise<number> {
  const result = await prisma.notification.deleteMany({
    where: {
      eventKey: PUSHOVER_IN_APP_EVENT_KEY,
      createdAt: { lt: pushoverInAppCutoff(now) },
    },
  });
  return result.count;
}
