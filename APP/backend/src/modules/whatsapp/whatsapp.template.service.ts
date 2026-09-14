import type { FastifyInstance } from "fastify";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import type { WhatsAppTemplateDto } from "src/modules/whatsapp/whatsapp.schema";

export function createWhatsAppTemplateService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list(): Promise<WhatsAppTemplateDto[]> {
    const current = await prisma.whatsAppConnection.findFirst({
      where: { status: { in: [...WHATSAPP_CURRENT_STATUSES] } },
      select: {
        status: true,
        wabaId: true,
        credentialCiphertext: true,
      },
    });
    if (!current || current.status !== "LINKED" || !current.wabaId || !current.credentialCiphertext) {
      throw whatsappError.conversationConnectionInactive();
    }
    const provider = createWhatsAppProvider();
    if (!provider.configured) throw whatsappError.providerNotConfigured();
    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(current.credentialCiphertext);
    } catch {
      throw whatsappError.sendAuthFailed();
    }
    const listed = await provider.listMessageTemplates(accessToken, current.wabaId);
    if (!listed.ok) {
      if (listed.code === "NOT_CONFIGURED") throw whatsappError.providerNotConfigured();
      throw whatsappError.templateNotFound();
    }
    return listed.value.map((item) => ({
      providerTemplateId: item.providerTemplateId,
      name: item.name,
      language: item.language,
      status: item.status,
      category: item.category,
      sendable: item.sendable,
      bodyText: item.bodyText,
      headerText: item.headerText,
      footerText: item.footerText,
      bodyVariableCount: item.bodyVariableCount,
      headerVariableCount: item.headerVariableCount,
    }));
  }

  return { list };
}
