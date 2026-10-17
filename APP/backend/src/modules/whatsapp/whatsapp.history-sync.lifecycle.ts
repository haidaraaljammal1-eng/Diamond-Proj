import type { FastifyBaseLogger } from "fastify";
import type { Prisma, PrismaClient, WhatsAppConnectionStatus } from "@prisma/client";

type HistorySyncDb = PrismaClient | Prisma.TransactionClient;
import { env } from "src/config/env";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";

const ACTIVE: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

export async function cancelActiveHistorySyncRuns(
  prisma: HistorySyncDb,
  connectionId: string,
  lastErrorCode: string,
): Promise<void> {
  await prisma.whatsAppHistorySyncRun.updateMany({
    where: { connectionId, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: "CANCELLED",
      cancelRequested: true,
      lastErrorCode,
      completedAt: new Date(),
    },
  });
}

/**
 * On API listen: isolate stale runs, pause interrupted workers when auto-execute is off,
 * resume RUNNING jobs only when auto-execute is enabled.
 */
export async function reconcileWhatsAppHistorySyncOnBoot(
  prisma: PrismaClient,
  log: FastifyBaseLogger,
  scheduleRun: (runId: string) => void,
): Promise<void> {
  if (env.WHATSAPP_PROVIDER !== "WHAPI") return;

  const activeRuns = await prisma.whatsAppHistorySyncRun.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true, connectionId: true, status: true },
  });

  for (const run of activeRuns) {
    const connection = await prisma.whatsAppConnection.findUnique({
      where: { id: run.connectionId },
      select: { status: true },
    });
    if (!connection || !ACTIVE.includes(connection.status)) {
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: run.id },
        data: {
          status: "CANCELLED",
          lastErrorCode: "WHATSAPP_HISTORY_SYNC_CONNECTION_INACTIVE",
          completedAt: new Date(),
        },
      });
    }
  }

  if (!env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE) {
    const interrupted = await prisma.whatsAppHistorySyncRun.updateMany({
      where: { status: "RUNNING" },
      data: {
        status: "QUEUED",
        lastErrorCode: "WHATSAPP_HISTORY_SYNC_INTERRUPTED",
      },
    });
    if (interrupted.count > 0) {
      log.info(
        { count: interrupted.count },
        "whatsapp history sync: interrupted RUNNING runs re-queued (auto execute disabled)",
      );
    }
    return;
  }

  const toResume = await prisma.whatsAppHistorySyncRun.findMany({
    where: { status: "RUNNING" },
    select: { id: true, connectionId: true },
  });
  for (const run of toResume) {
    const connection = await prisma.whatsAppConnection.findUnique({
      where: { id: run.connectionId },
      select: { status: true },
    });
    if (connection && ACTIVE.includes(connection.status)) {
      scheduleRun(run.id);
    }
  }
  if (toResume.length > 0) {
    log.info({ count: toResume.length }, "whatsapp history sync: resumed RUNNING runs on boot");
  }
}
