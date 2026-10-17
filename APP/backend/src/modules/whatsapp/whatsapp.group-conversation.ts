import type { Prisma, PrismaClient } from "@prisma/client";
import { isWhapiGroupChatId } from "src/modules/whatsapp/whapi.chat-id";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { sanitizeGroupParticipants, type WhatsAppGroupParticipantSnapshot } from "src/modules/whatsapp/whatsapp.group-display";

export function assertGroupChatId(chatId: string): void {
  if (!isWhapiGroupChatId(chatId)) {
    throw new Error("WHATSAPP_GROUP_CHAT_ID_REQUIRED");
  }
}

export async function upsertGroupProfile(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    connectionId: string;
    providerGroupId: string;
    groupName: string | null;
    participantCount: number;
    hasIcon: boolean;
    participants: WhatsAppGroupParticipantSnapshot[];
  },
): Promise<void> {
  assertGroupChatId(input.providerGroupId);
  await prisma.whatsAppGroupProfile.upsert({
    where: {
      connectionId_providerGroupId: {
        connectionId: input.connectionId,
        providerGroupId: input.providerGroupId,
      },
    },
    create: {
      connectionId: input.connectionId,
      providerGroupId: input.providerGroupId,
      groupName: input.groupName,
      participantCount: input.participantCount,
      hasIcon: input.hasIcon,
      participants: input.participants as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
    update: {
      ...(input.groupName?.trim() ? { groupName: input.groupName.trim() } : {}),
      participantCount: input.participantCount,
      hasIcon: input.hasIcon,
      participants: input.participants as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
  });
}

export async function ensureGroupConversation(
  prisma: PrismaClient | Prisma.TransactionClient,
  connectionId: string,
  providerGroupId: string,
  groupName: string | null,
): Promise<{ id: string; created: boolean }> {
  assertGroupChatId(providerGroupId);
  const existing = await prisma.whatsAppConversation.findFirst({
    where: { connectionId, providerChatId: providerGroupId },
    select: { id: true, customerDisplayName: true },
  });
  if (existing) {
    if (groupName?.trim() && existing.customerDisplayName !== groupName.trim()) {
      await prisma.whatsAppConversation.update({
        where: { id: existing.id },
        data: { customerDisplayName: groupName.trim() },
      });
    }
    return { id: existing.id, created: false };
  }
  try {
    const created = await prisma.whatsAppConversation.create({
      data: {
        connectionId,
        kind: "GROUP",
        customerWaId: providerGroupId,
        providerChatId: providerGroupId,
        customerDisplayName: groupName?.trim() || null,
        unreadCount: 0,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const row = await prisma.whatsAppConversation.findUniqueOrThrow({
      where: { connectionId_customerWaId: { connectionId, customerWaId: providerGroupId } },
      select: { id: true },
    });
    return { id: row.id, created: false };
  }
}

export function participantsFromWhapiGroupRow(row: Record<string, unknown>): WhatsAppGroupParticipantSnapshot[] {
  const participants = row.participants;
  return sanitizeGroupParticipants(participants);
}
