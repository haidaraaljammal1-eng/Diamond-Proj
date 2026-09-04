import type { FastifyInstance } from "fastify";
import type { CommunicationChannel } from "@prisma/client";
import { resolveEmailTransport } from "src/lib/email/resolve-transport";
import type { ProviderRegistry } from "src/modules/communication/providers";
import { getDescriptor, configFieldKeys, type CatalogKind } from "src/modules/integrations/catalog";

/**
 * Read model for channel provider readiness + SAFE display metadata for the UI
 * (so the frontend never hardcodes "Connected"). Derived from the actual provider
 * config. NEVER returns secrets (passwords / tokens / API keys / SMTP credentials)
 * — only display-safe identity like the email from-address or the SMS sender id.
 */
export interface ChannelReadiness {
  channel: CommunicationChannel;
  status: "CONFIGURED" | "NOT_CONFIGURED" | "UNAVAILABLE";
  senderIdentity: string | null;
  displayName: string | null;
}

/** Non-secret config value for a managed integration. Reads ONLY keys the catalog
 *  marks non-secret, so a token/apiKey can never be surfaced by this read model. */
async function safeConfigValue(
  fastify: FastifyInstance,
  kind: CatalogKind,
  key: string,
): Promise<string | null> {
  if (!configFieldKeys(kind).includes(key)) return null; // refuse anything secret-shaped
  const row = await fastify.prisma.integrationConnection.findUnique({
    where: { kind_name: { kind, name: getDescriptor(kind).name } },
    select: { metadata: true },
  });
  const config = (row?.metadata as Record<string, string> | null) ?? {};
  const value = config[key];
  return value != null && value !== "" ? value : null;
}

export async function channelReadiness(
  providers: ProviderRegistry,
  fastify: FastifyInstance,
): Promise<ChannelReadiness[]> {
  const channels: CommunicationChannel[] = ["EMAIL", "WHATSAPP", "SMS"];
  return Promise.all(
    channels.map(async (channel) => {
      const status = await providers[channel].readiness();
      let senderIdentity: string | null = null;
      let displayName: string | null = null;
      if (status === "CONFIGURED") {
        if (channel === "EMAIL") {
          senderIdentity = (await resolveEmailTransport(fastify))?.from ?? null;
        } else if (channel === "SMS") {
          // The gateway sender id shown to the recipient — non-secret by catalog.
          senderIdentity = await safeConfigValue(fastify, "SMS", "senderId");
          displayName = getDescriptor("SMS").name;
        } else if (channel === "WHATSAPP") {
          // Business phone-number id (non-secret); the access token is never read.
          senderIdentity = await safeConfigValue(fastify, "WHATSAPP", "phoneNumberId");
          displayName = getDescriptor("WHATSAPP").name;
        }
      }
      return { channel, status, senderIdentity, displayName };
    }),
  );
}
