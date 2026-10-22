import type { PrismaClient } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import {
  customerWaIdFromWhapiChatId,
  isWhapiDirectChatId,
  isWhapiGroupChatId,
  isWhapiLidChatId,
  isWhapiPhoneChatId,
} from "src/modules/whatsapp/whapi.chat-id";
import { phoneDigitsForMatch } from "src/modules/whatsapp/whatsapp.customer-match";

function recipientAmbiguous(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    statusCode: 409,
    message: "WhatsApp recipient is ambiguous",
    context: { reason: "WHATSAPP_RECIPIENT_AMBIGUOUS" },
  });
}

function recipientInvalid(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    statusCode: 400,
    message: "WhatsApp recipient is not eligible for fleet share",
    context: { reason: "WHATSAPP_RECIPIENT_INVALID" },
  });
}

function conversationNotFound(): AppError {
  return AppError.notFound("WhatsApp conversation not found");
}

type DirectConversationRow = {
  id: string;
  customerWaId: string;
  customerId: number | null;
  providerChatId: string | null;
  kind: string;
};

function assertDirectConversation(row: DirectConversationRow | null): DirectConversationRow {
  if (!row) throw conversationNotFound();
  if (row.kind !== "DIRECT") throw recipientInvalid();
  if (isWhapiGroupChatId(row.providerChatId) || isWhapiGroupChatId(row.customerWaId)) {
    throw recipientInvalid();
  }
  return row;
}

async function findDirectByConversationId(
  prisma: PrismaClient,
  connectionId: string,
  conversationId: string,
): Promise<DirectConversationRow> {
  const row = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, connectionId },
    select: {
      id: true,
      customerWaId: true,
      customerId: true,
      providerChatId: true,
      kind: true,
    },
  });
  return assertDirectConversation(row);
}

async function findDirectMatchesForProviderContact(
  prisma: PrismaClient,
  connectionId: string,
  providerContactId: string,
): Promise<DirectConversationRow[]> {
  const waId = customerWaIdFromWhapiChatId(providerContactId);
  if (!waId) return [];

  const phoneDigits = phoneDigitsForMatch(waId);
  const or: Array<Record<string, unknown>> = [{ providerChatId: providerContactId }];
  if (phoneDigits) {
    or.push({ customerWaId: phoneDigits });
    or.push({ customerWaId: waId });
  } else {
    or.push({ customerWaId: waId });
  }

  return prisma.whatsAppConversation.findMany({
    where: {
      connectionId,
      kind: "DIRECT",
      OR: or,
    },
    select: {
      id: true,
      customerWaId: true,
      customerId: true,
      providerChatId: true,
      kind: true,
    },
  });
}

/**
 * Resolve a DIRECT office conversation for fleet gallery share.
 * Never links customerId. Contact must be synced (profile row) when using providerContactId.
 */
export async function resolveFleetShareWhatsAppConversation(
  prisma: PrismaClient,
  input: {
    connectionId: string;
    conversationId?: string;
    providerContactId?: string;
  },
): Promise<{ conversationId: string }> {
  const hasConversation = Boolean(input.conversationId?.trim());
  const hasContact = Boolean(input.providerContactId?.trim());
  if (hasConversation === hasContact) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: "Provide exactly one of conversationId or providerContactId",
    });
  }

  if (input.conversationId) {
    const row = await findDirectByConversationId(
      prisma,
      input.connectionId,
      input.conversationId.trim(),
    );
    return { conversationId: row.id };
  }

  const providerContactId = input.providerContactId!.trim();
  if (!isWhapiDirectChatId(providerContactId) || isWhapiGroupChatId(providerContactId)) {
    throw recipientInvalid();
  }

  const profile = await prisma.whatsAppContactProfile.findUnique({
    where: {
      connectionId_providerContactId: { connectionId: input.connectionId, providerContactId },
    },
    select: { id: true },
  });
  if (!profile) throw recipientInvalid();

  const matches = await findDirectMatchesForProviderContact(
    prisma,
    input.connectionId,
    providerContactId,
  );
  if (matches.length > 1) throw recipientAmbiguous();
  if (matches.length === 1) {
    return { conversationId: matches[0]!.id };
  }

  const customerWaId = customerWaIdFromWhapiChatId(providerContactId);
  if (!customerWaId) throw recipientInvalid();

  const providerChatId =
    isWhapiPhoneChatId(providerContactId) || isWhapiLidChatId(providerContactId)
      ? providerContactId
      : null;

  try {
    const created = await prisma.whatsAppConversation.create({
      data: {
        connectionId: input.connectionId,
        kind: "DIRECT",
        customerWaId,
        providerChatId,
        unreadCount: 0,
      },
      select: { id: true },
    });
    return { conversationId: created.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await findDirectMatchesForProviderContact(
      prisma,
      input.connectionId,
      providerContactId,
    );
    if (raced.length !== 1) throw recipientAmbiguous();
    return { conversationId: raced[0]!.id };
  }
}
