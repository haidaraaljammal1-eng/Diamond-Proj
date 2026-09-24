import type { FastifyInstance } from "fastify";
import { BUSINESS_NOTIFICATION_OUTBOX_TYPES } from "src/modules/notification-delivery/business-notification.constants";
import {
  createBusinessNotificationService,
  parseOutboxPayload,
} from "src/modules/notification-delivery/business-notification.service";

export function createBusinessNotificationOutboxConsumer(app: FastifyInstance) {
  const prisma = app.prisma;
  const notifications = createBusinessNotificationService(prisma);

  async function consumeOutbox(): Promise<number> {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 5 * 60_000);
    await prisma.domainOutboxEvent.updateMany({
      where: { status: "PROCESSING", lockedAt: { lt: staleCutoff } },
      data: { status: "PENDING", lockedAt: null },
    });

    const due = await prisma.domainOutboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: now },
        eventType: { in: [...BUSINESS_NOTIFICATION_OUTBOX_TYPES] },
      },
      orderBy: { id: "asc" },
      take: 100,
    });

    let processed = 0;
    for (const event of due) {
      const claim = await prisma.domainOutboxEvent.updateMany({
        where: { id: event.id, status: "PENDING" },
        data: { status: "PROCESSING", lockedAt: now },
      });
      if (claim.count === 0) continue;

      try {
        await notifications.handleOutboxEvent(event.eventType, parseOutboxPayload(event.payload));
        await prisma.domainOutboxEvent.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: now, lockedAt: null },
        });
        processed += 1;
      } catch (err) {
        const attempt = event.attemptCount + 1;
        const failed = attempt >= event.maxAttempts;
        await prisma.domainOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: failed ? "FAILED" : "PENDING",
            attemptCount: attempt,
            lockedAt: null,
            availableAt: new Date(now.getTime() + Math.min(60, 2 ** attempt) * 60_000),
            lastErrorCode: String((err as Error)?.message ?? "").slice(0, 120),
          },
        });
        app.log.error({ err, outboxId: event.id }, "business-notification outbox event failed");
      }
    }

    return processed;
  }

  return { consumeOutbox };
}
