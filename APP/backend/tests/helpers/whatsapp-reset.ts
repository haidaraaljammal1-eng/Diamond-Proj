import type { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl } from "./integration-harness";

/** Child rows first — conversation/message FKs restrict connection deletes. */
export async function resetWhatsAppTables(prisma: PrismaClient) {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  assertTestDatabaseUrl(url);
  await prisma.whatsAppOutboundAttempt.deleteMany();
  await prisma.whatsAppMessage.deleteMany();
  await prisma.whatsAppConversation.deleteMany();
  await prisma.whatsAppWebhookEvent.deleteMany();
  await prisma.whatsAppConnectionAttempt.deleteMany();
  await prisma.whatsAppHistorySyncRun.deleteMany();
  await prisma.whatsAppConnectionChatSyncCheckpoint.deleteMany();
  await prisma.whatsAppContactProfile.deleteMany();
  await prisma.whatsAppContactSyncState.deleteMany();
  await prisma.whatsAppGroupProfile.deleteMany();
  await prisma.whatsAppConnection.deleteMany();
  await prisma.domainOutboxEvent.deleteMany({
    where: { eventType: { startsWith: "whatsapp." } },
  });
}
