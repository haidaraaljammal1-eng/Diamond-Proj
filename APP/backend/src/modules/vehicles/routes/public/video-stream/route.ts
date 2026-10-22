import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createVehicleVideoService } from "src/modules/vehicles/vehicle-video.service";
import { corsHeadersForOrigin } from "src/lib/http/cors-origin";

const StreamQuery = z.object({
  token: z.string().min(1),
});

/**
 * Token-gated vehicle video stream for HTML5 playback (Range requests).
 * JWT is not sent by `<video>`; staff mint a short-lived token via the admin API.
 */
export default async function vehicleVideoPublicStreamRoute(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const video = createVehicleVideoService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "Stream a vehicle video via signed playback token",
        operationId: "streamVehicleVideoPlayback",
        tags: ["Vehicles"],
        querystring: StreamQuery,
      },
    },
    async (request, reply) => {
      const rangeHeader = request.headers.range;
      const opened = await video.openStreamWithToken(
        typeof rangeHeader === "string" ? rangeHeader : undefined,
        request.query.token,
      );
      const cors = corsHeadersForOrigin(request.headers.origin);
      for (const [key, value] of Object.entries(cors)) {
        reply.header(key, value);
      }
      if (opened.kind === "invalid_range") {
        reply.header("Content-Range", `bytes */${opened.fileSize}`);
        return reply.status(416).send();
      }
      return video.sendStreamReply(reply, opened);
    },
  );
}
