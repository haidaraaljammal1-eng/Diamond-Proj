import type { FastifyInstance } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { paginate } from "src/lib/http/pagination";
import type { z } from "zod";
import type {
  BroadcastSchema,
  ListNotificationsQuerySchema,
  UpdatePreferencesSchema,
} from "src/modules/notifications/notifications.schema";

export function createNotificationsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list(
    userId: number,
    query: z.infer<typeof ListNotificationsQuerySchema>,
  ) {
    const where = { userId, ...(query.unreadOnly ? { readAt: null } : {}) };
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.notification.count({ where }),
      findMany: (skip, take) =>
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            eventKey: true,
            title: true,
            body: true,
            data: true,
            readAt: true,
            createdAt: true,
          },
        }),
    });
  }

  async function unreadCount(userId: number) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  }

  async function markRead(userId: number, id: string) {
    // Scoped by userId → a user can only affect their own notifications.
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw AppError.notFound("Notification not found");
  }

  async function markAllRead(userId: number) {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async function getPreferences(userId: number) {
    const [definitions, preferences] = await Promise.all([
      prisma.notificationDefinition.findMany({ orderBy: { key: "asc" } }),
      prisma.notificationPreference.findMany({ where: { userId } }),
    ]);
    const prefByKey = new Map(preferences.map((p) => [p.eventKey, p]));
    return definitions.map((def) => {
      const pref = prefByKey.get(def.key);
      return {
        eventKey: def.key,
        enabled: pref?.enabled ?? true,
        channels:
          (pref?.channels as string[] | undefined) ?? (def.defaultChannels as string[]),
      };
    });
  }

  async function updatePreferences(
    userId: number,
    input: z.infer<typeof UpdatePreferencesSchema>,
  ) {
    for (const pref of input.preferences) {
      await prisma.notificationPreference.upsert({
        where: { userId_eventKey: { userId, eventKey: pref.eventKey } },
        update: { enabled: pref.enabled, channels: pref.channels },
        create: {
          userId,
          eventKey: pref.eventKey,
          enabled: pref.enabled,
          channels: pref.channels,
        },
      });
    }
    return getPreferences(userId);
  }

  async function broadcast(input: z.infer<typeof BroadcastSchema>) {
    let userIds = input.userIds ?? [];
    if (input.toAllActive) {
      const active = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      userIds = [...userIds, ...active.map((u) => u.id)];
    }
    userIds = [...new Set(userIds)];

    await fastify.notify.send({
      eventKey: input.eventKey,
      userIds,
      title: input.title,
      body: input.body,
      data: input.data,
    });
    return { recipients: userIds.length };
  }

  return {
    list,
    unreadCount,
    markRead,
    markAllRead,
    getPreferences,
    updatePreferences,
    broadcast,
  };
}
