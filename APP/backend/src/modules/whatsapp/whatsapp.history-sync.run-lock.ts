import type { PrismaClient } from "@prisma/client";
import { advisoryLockKey } from "src/lib/db/advisory-lock";
import { WHATSAPP_HISTORY_SYNC_LOCK_NS } from "src/modules/whatsapp/whatsapp.constants";

export async function tryAcquireHistorySyncRunLock(
  prisma: PrismaClient,
  runId: string,
): Promise<boolean> {
  const [lockA, lockB] = advisoryLockKey(WHATSAPP_HISTORY_SYNC_LOCK_NS, runId);
  const rows = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(${lockA}::integer, ${lockB}::integer) AS acquired
  `;
  return rows[0]?.acquired === true;
}

export async function releaseHistorySyncRunLock(
  prisma: PrismaClient,
  runId: string,
): Promise<void> {
  const [lockA, lockB] = advisoryLockKey(WHATSAPP_HISTORY_SYNC_LOCK_NS, runId);
  await prisma.$executeRaw`
    SELECT pg_advisory_unlock(${lockA}::integer, ${lockB}::integer)
  `;
}
