import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { SYSTEM_ROLES } from "src/constants/roles";
import {
  ROAD_LIABILITY_CHARGEABLE_NOTIFICATION,
  ROAD_LIABILITY_OUTBOX_EVENT,
} from "src/modules/road-liabilities/road-liability.constants";

const OUTBOX_TYPES = [ROAD_LIABILITY_OUTBOX_EVENT];

export function createRoadLiabilityOutboxConsumer(app: FastifyInstance) {
  const prisma = app.prisma;

  async function permissionHolders(permKey: string): Promise<number[]> {
    const rows = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: {
          some: {
            role: {
              OR: [
                { key: SYSTEM_ROLES.SYSTEM_ADMIN },
                { permissions: { some: { permission: { key: permKey } } } },
              ],
            },
          },
        },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async function handleChargeable(payload: Prisma.JsonObject): Promise<void> {
    const liabilityId = String(payload.liabilityId ?? "");
    const contractId = String(payload.contractId ?? "");
    const amount = typeof payload.amount === "number" ? payload.amount : null;
    const type = String(payload.type ?? "RTA_VIOLATION");
    if (!liabilityId || !contractId) return;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { contractNumber: true },
    });

    const userIds = await permissionHolders(PERMISSIONS.VIOLATIONS_CHARGE);
    if (userIds.length === 0) return;

    const amountLabel = amount != null ? `${amount} AED` : "";
    await app.notify.send({
      eventKey: ROAD_LIABILITY_CHARGEABLE_NOTIFICATION,
      userIds,
      title: "مخالفة جديدة قابلة للتحصيل",
      body: amountLabel
        ? `تم تسجيل مخالفة بقيمة ${amountLabel} مرتبطة بالعقد ${contract?.contractNumber ?? contractId}.`
        : `تم تسجيل مخالفة مرتبطة بالعقد ${contract?.contractNumber ?? contractId}.`,
      data: {
        liabilityId,
        contractId,
        type,
        amount,
      },
      dedupeKeyPrefix: `${ROAD_LIABILITY_CHARGEABLE_NOTIFICATION}:${liabilityId}`,
    });
  }

  async function handleOutboxEvent(ev: { eventType: string; payload: Prisma.JsonValue }): Promise<boolean> {
    if (ev.eventType !== ROAD_LIABILITY_OUTBOX_EVENT) return false;
    const payload = (ev.payload ?? {}) as Prisma.JsonObject;
    await handleChargeable(payload);
    return true;
  }

  async function runRoadLiabilityOutboxCycle(): Promise<{ created: number }> {
    const staleCutoff = new Date(Date.now() - 5 * 60_000);
    await prisma.domainOutboxEvent.updateMany({
      where: { status: "PROCESSING", lockedAt: { lt: staleCutoff } },
      data: { status: "PENDING", lockedAt: null },
    });

    const due = await prisma.domainOutboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: new Date() },
        eventType: { in: OUTBOX_TYPES },
      },
      orderBy: { id: "asc" },
      take: 100,
    });

    let created = 0;
    for (const ev of due) {
      const claim = await prisma.domainOutboxEvent.updateMany({
        where: { id: ev.id, status: "PENDING" },
        data: { status: "PROCESSING", lockedAt: new Date() },
      });
      if (claim.count === 0) continue;
      try {
        if (await handleOutboxEvent(ev)) created += 1;
        await prisma.domainOutboxEvent.update({
          where: { id: ev.id },
          data: { status: "PROCESSED", processedAt: new Date(), lockedAt: null },
        });
      } catch (error) {
        const attempt = ev.attemptCount + 1;
        const failed = attempt >= 8;
        await prisma.domainOutboxEvent.update({
          where: { id: ev.id },
          data: {
            status: failed ? "FAILED" : "PENDING",
            attemptCount: attempt,
            lockedAt: null,
            availableAt: new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000),
            lastErrorCode: String((error as Error)?.message ?? "").slice(0, 120),
          },
        });
        app.log.warn({ err: error, outboxId: ev.id }, "road-liability outbox failed");
      }
    }
    return { created };
  }

  return { runRoadLiabilityOutboxCycle };
}
