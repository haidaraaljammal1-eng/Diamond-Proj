import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PERMISSIONS } from "src/constants/permissions";
import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import { commonErrorResponses } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import {
  WHATSAPP_REALTIME_HEARTBEAT_MS,
} from "src/modules/whatsapp/whatsapp.constants";
import { formatSseFrame } from "src/modules/whatsapp/whatsapp.realtime";
import { startWhatsAppRealtimeFanout } from "src/modules/whatsapp/whatsapp.realtime-fanout";
import { listWhatsAppRealtimeSince } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { getWhatsAppRealtimePublisher } from "src/modules/whatsapp/whatsapp.realtime-publisher";

const T = ["WhatsApp"];

const LastEventIdHeader = z
  .object({
    "last-event-id": z.string().regex(/^[0-9]+$/).optional(),
  })
  .passthrough();

export default async function whatsappRealtimeRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const hub = getWhatsAppRealtimePublisher();
  let stopFanout: (() => void) | undefined;

  fastify.addHook("onListen", async () => {
    stopFanout = startWhatsAppRealtimeFanout(fastify.prisma, fastify.log);
  });
  fastify.addHook("onClose", async () => {
    stopFanout?.();
  });

  app.get(
    "/",
    {
      config: {
        compress: false,
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        summary: "WhatsApp Inbox SSE stream (notification only; REST remains source of truth)",
        operationId: "streamWhatsAppRealtime",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        headers: LastEventIdHeader,
        response: {
          200: z.string(),
          ...commonErrorResponses,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (hub.atCapacity) {
        throw new AppError({
          code: ErrorCode.RATE_LIMITED,
          message: "Too many requests, please try again later",
          statusCode: 429,
        });
      }

      const identity = requireAuth(request);
      request.setAudit({ skip: true });
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.flushHeaders?.();
    request.raw.setTimeout(0);
    reply.raw.setTimeout(0);

      const lastEventIdHeader = request.headers["last-event-id"];
      const afterId =
        typeof lastEventIdHeader === "string" && /^[0-9]+$/.test(lastEventIdHeader)
          ? Number(lastEventIdHeader)
          : 0;

      fastify.log.info(
        { userId: identity.id, afterId },
        "whatsapp sse subscriber connected",
      );

      const write = (chunk: string) => {
        if (!reply.raw.writableEnded) reply.raw.write(chunk);
      };

      if (afterId > 0) {
        const missed = await listWhatsAppRealtimeSince(fastify.prisma, afterId, 100);
        for (const event of missed) write(formatSseFrame(event));
      }

      write(": ping\n\n");

      const unsubscribe = hub.subscribe((event) => {
        write(formatSseFrame(event));
      });
      const heartbeat = setInterval(() => write(": ping\n\n"), WHATSAPP_REALTIME_HEARTBEAT_MS);
      heartbeat.unref?.();

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeat);
        unsubscribe();
        fastify.log.info(
          { userId: identity.id, subscribers: hub.subscriberCount },
          "whatsapp sse subscriber disconnected",
        );
        if (!reply.raw.writableEnded) reply.raw.end();
      };

      request.raw.on("close", cleanup);
      request.raw.on("aborted", cleanup);
    },
  );
}
