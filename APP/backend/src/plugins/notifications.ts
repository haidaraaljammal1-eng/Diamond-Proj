import fp from "fastify-plugin";
import { Prisma, type PrismaClient } from "@prisma/client";
import { runIdempotent } from "src/lib/db/idempotency";

/**
 * Generic notification pipeline:
 *   event → (caller-resolved recipients) → per-recipient preferences →
 *   channel selection → deliver → dedupe → delivery log.
 *
 * Audience resolution is DOMAIN-SPECIFIC and stays out of the starter: callers
 * pass explicit recipient userIds. Every recipient's own preferences are then
 * applied — an admin does not implicitly receive everything.
 */
export interface NotifyParams {
  eventKey: string;
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** When set, delivery is idempotent per recipient (dedupeKeyPrefix + userId). */
  dedupeKeyPrefix?: string;
  /**
   * System-enabled channels for this event (e.g. from an admin settings matrix).
   * When provided, these REPLACE the definition defaults as the authoritative set;
   * a user preference can only NARROW them — never enable a channel the admin
   * disabled. Absent → fall back to the NotificationDefinition defaults.
   */
  channels?: string[];
}

export interface NotifyService {
  send(params: NotifyParams): Promise<void>;
}

declare module "fastify" {
  interface FastifyInstance {
    notify: NotifyService;
  }
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export const notificationsPlugin = fp(
  async (fastify) => {
    const prisma: PrismaClient = fastify.prisma;

    async function logDelivery(
      userId: number,
      eventKey: string,
      channel: "IN_APP" | "EMAIL" | "PUSH" | "SMS",
      status: "DELIVERED" | "FAILED" | "SKIPPED",
      reason?: string,
      notificationId?: string,
    ) {
      await prisma.notificationDeliveryLog.create({
        data: { userId, eventKey, channel, status, reason, notificationId },
      });
    }

    async function deliverInApp(userId: number, params: NotifyParams) {
      const create = async () => {
        const notification = await prisma.notification.create({
          data: {
            userId,
            eventKey: params.eventKey,
            title: params.title,
            body: params.body,
            data: jsonOrNull(params.data),
          },
        });
        await logDelivery(
          userId,
          params.eventKey,
          "IN_APP",
          "DELIVERED",
          undefined,
          notification.id,
        );
      };

      if (params.dedupeKeyPrefix) {
        const result = await runIdempotent(
          prisma,
          { scope: "notify:in_app", key: `${params.dedupeKeyPrefix}:${userId}` },
          create,
        );
        if (result.deduped) {
          await logDelivery(userId, params.eventKey, "IN_APP", "SKIPPED", "deduped");
        }
      } else {
        await create();
      }
    }

    const notify: NotifyService = {
      async send(params) {
        const definition = await prisma.notificationDefinition.findUnique({
          where: { key: params.eventKey },
        });
        // Admin-provided system channels win; else the definition defaults.
        const systemChannels =
          params.channels ?? (definition?.defaultChannels as string[] | undefined) ?? ["IN_APP"];

        for (const userId of params.userIds) {
          const preference = await prisma.notificationPreference.findUnique({
            where: { userId_eventKey: { userId, eventKey: params.eventKey } },
          });

          if (preference && !preference.enabled) {
            await logDelivery(
              userId,
              params.eventKey,
              "IN_APP",
              "SKIPPED",
              "preference disabled",
            );
            continue;
          }

          // A user preference can only NARROW the system-enabled set (never enable
          // a channel the admin disabled).
          const preferred = (preference?.channels as string[] | undefined) ?? systemChannels;
          const channels = preferred.filter((c) => systemChannels.includes(c));

          for (const channel of channels) {
            if (channel === "IN_APP") {
              await deliverInApp(userId, params);
            } else if (channel === "EMAIL" && fastify.capabilities.email) {
              // Email delivery is left as a foundation hook: resolve the user's
              // email + template here when a domain needs it.
              await logDelivery(
                userId,
                params.eventKey,
                "EMAIL",
                "SKIPPED",
                "no template bound",
              );
            } else {
              await logDelivery(
                userId,
                params.eventKey,
                channel as "PUSH" | "SMS",
                "SKIPPED",
                "channel not available",
              );
            }
          }
        }
      },
    };

    fastify.decorate("notify", notify);
  },
  { name: "notifications", dependencies: ["prisma", "capabilities"] },
);
