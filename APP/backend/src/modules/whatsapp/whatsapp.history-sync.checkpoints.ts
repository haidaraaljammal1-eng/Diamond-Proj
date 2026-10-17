import type { PrismaClient } from "@prisma/client";

export async function getChatSyncCheckpoint(
  prisma: PrismaClient,
  connectionId: string,
  providerChatId: string,
): Promise<Date | null> {
  const row = await prisma.whatsAppConnectionChatSyncCheckpoint.findUnique({
    where: { connectionId_providerChatId: { connectionId, providerChatId } },
    select: { lastSyncedOccurredAt: true },
  });
  return row?.lastSyncedOccurredAt ?? null;
}

export async function upsertChatSyncCheckpoint(
  prisma: PrismaClient,
  connectionId: string,
  providerChatId: string,
  candidate: Date | null,
): Promise<void> {
  if (!candidate) return;
  const existing = await getChatSyncCheckpoint(prisma, connectionId, providerChatId);
  const next =
    existing && existing.getTime() > candidate.getTime() ? existing : candidate;
  await prisma.whatsAppConnectionChatSyncCheckpoint.upsert({
    where: { connectionId_providerChatId: { connectionId, providerChatId } },
    create: {
      connectionId,
      providerChatId,
      lastSyncedOccurredAt: next,
    },
    update: { lastSyncedOccurredAt: next },
  });
}

export async function connectionHasChatSyncCheckpoints(
  prisma: PrismaClient,
  connectionId: string,
): Promise<boolean> {
  const row = await prisma.whatsAppConnectionChatSyncCheckpoint.findFirst({
    where: { connectionId },
    select: { id: true },
  });
  return Boolean(row);
}
