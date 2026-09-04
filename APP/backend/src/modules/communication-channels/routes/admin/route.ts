import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { CommunicationChannelSchema } from "src/modules/communication/communication.schema";
import { channelReadiness } from "src/modules/communication/channel-readiness";
import { defaultProviderRegistry } from "src/modules/communication/providers";

const ChannelReadinessSchema = z.object({
  channel: CommunicationChannelSchema,
  status: z.enum(["CONFIGURED", "NOT_CONFIGURED", "UNAVAILABLE"]),
  senderIdentity: z.string().nullable(),
  displayName: z.string().nullable(),
});

/** Mounts under /communication-channels. Read model of provider readiness (no secrets). */
export default async function communicationChannelsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        summary: "Channel provider readiness (never a hardcoded Connected)",
        operationId: "getCommunicationChannelReadiness",
        tags: ["Communication Templates"],
        permissions: [PERMISSIONS.COMMUNICATION_TEMPLATES_READ],
        response: { 200: dataResponse(z.array(ChannelReadinessSchema)), ...commonErrorResponses },
      },
    },
    async () => ({ data: await channelReadiness(defaultProviderRegistry(fastify), fastify) }),
  );
}
