import type { PrismaClient } from "@prisma/client";

/** Child rows first — conversation/message FKs restrict connection deletes. */
export async function resetWhatsAppTables(prisma: PrismaClient) {
  await prisma.whatsAppOutboundAttempt.deleteMany();
  await prisma.whatsAppMessage.deleteMany();
  await prisma.whatsAppConversation.deleteMany();
  await prisma.whatsAppWebhookEvent.deleteMany();
  await prisma.whatsAppConnectionAttempt.deleteMany();
  await prisma.whatsAppConnection.deleteMany();
  await prisma.domainOutboxEvent.deleteMany({
    where: { eventType: { startsWith: "whatsapp." } },
  });
}
