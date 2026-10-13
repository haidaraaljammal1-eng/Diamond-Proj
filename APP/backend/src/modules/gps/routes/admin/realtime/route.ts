import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PERMISSIONS } from "src/constants/permissions";
import { commonErrorResponses } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { corsHeadersForOrigin, isCorsOriginAllowed } from "src/lib/http/cors-origin";
import { getSevenStarsLivePublisher } from "src/modules/gps/providers/seven-stars/seven-stars-live.publisher";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export default async function gpsRealtimeRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const publisher = getSevenStarsLivePublisher();

  app.get(
    "/",
    {
      config: {
        compress: false,
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
      schema: {
        summary: "Seven Stars GPS realtime stream",
        operationId: "streamGpsRealtime",
        tags: ["GPS"],
        permissions: [PERMISSIONS.GPS_READ],
        response: { 200: z.string(), ...commonErrorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const identity = requireAuth(request);
      const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
      if (origin && !isCorsOriginAllowed(origin)) {
        throw new AppError({ code: ErrorCode.FORBIDDEN, message: "Origin not allowed", statusCode: 403 });
      }
      request.setAudit({ skip: true });
      reply.hijack();
      reply.raw.writeHead(200, {
        ...corsHeadersForOrigin(origin),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.flushHeaders?.();
      request.raw.setTimeout(0);
      reply.raw.setTimeout(0);

      const write = (value: string) => {
        if (!reply.raw.writableEnded) reply.raw.write(value);
      };
      write(": ping\n\n");
      const unsubscribe = publisher.subscribe((event) => {
        write(
          `event: gps.position\ndata: ${JSON.stringify({
            vehicleId: event.vehicleId,
            providerKey: event.providerKey,
            latitude: event.latitude,
            longitude: event.longitude,
            speedKph: event.speedKph,
            headingDegrees: event.headingDegrees,
            ignitionOn: event.ignitionOn,
            motionState: event.motionState,
            capturedAt: event.capturedAt.toISOString(),
          })}\n\n`,
        );
      });
      const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      heartbeat.unref?.();
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeat);
        unsubscribe();
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      reply.raw.on("close", cleanup);
      request.raw.on("aborted", cleanup);
      reply.raw.socket?.on("close", cleanup);
      fastify.log.debug({ userId: identity.id }, "gps realtime subscriber connected");
    },
  );
}
