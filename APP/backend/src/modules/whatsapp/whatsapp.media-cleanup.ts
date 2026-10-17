import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { advisoryLockKey } from "src/lib/db/advisory-lock";
import { cleanupExpiredWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media-retention";
import { whatsappMediaRoot } from "src/modules/whatsapp/whatsapp.media-store";

const LOCK_NAMESPACE = "whatsapp_media_cleanup";
const LOCK_ENTITY = "cycle";

export type WhatsAppMediaCleanupResult = {
  skipped: boolean;
  expired: number;
};

/**
 * Bounded backlog drain with a session advisory lock so overlapping API replicas
 * do not delete the same files concurrently.
 */
export async function runWhatsAppMediaCleanupCycle(
  prisma: PrismaClient,
  log?: FastifyBaseLogger,
  now: Date = new Date(),
  root: string = whatsappMediaRoot(),
): Promise<WhatsAppMediaCleanupResult> {
  const [lockA, lockB] = advisoryLockKey(LOCK_NAMESPACE, LOCK_ENTITY);
  const acquired = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(${lockA}::integer, ${lockB}::integer) AS acquired
  `;
  if (!acquired[0]?.acquired) {
    log?.debug("whatsapp-media: cleanup skipped (another instance holds the lock)");
    return { skipped: true, expired: 0 };
  }
  try {
    let total = 0;
    for (let batch = 0; batch < 50; batch += 1) {
      const { expired } = await cleanupExpiredWhatsAppMedia(prisma, now, root);
      total += expired;
      if (expired === 0) break;
    }
    return { skipped: false, expired: total };
  } finally {
    await prisma.$executeRaw`
      SELECT pg_advisory_unlock(${lockA}::integer, ${lockB}::integer)
    `;
  }
}
