import type { Prisma, PrismaClient, WhatsAppMessageType } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { WHATSAPP_CONVERSATION_LOCK_NS } from "src/modules/whatsapp/whatsapp.constants";
import {
  buildMessagePreview,
  isNewerConversationMessage,
  mapWhatsAppMessageType,
} from "src/modules/whatsapp/whatsapp.message-type";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";

export interface OutboundEchoInput {
  connectionId: string;
  customerWaId: string;
  providerChatId: string;
  providerMessageId: string;
  messageType: string | null;
  textBody: string | null;
  caption?: string | null;
  mediaFilename?: string | null;
  providerOccurredAt: Date | null;
  receivedAt: Date;
  webhookEventId: string;
  source?: string | null;
}

export async function materializeOutboundEchoMessage(
  prisma: PrismaClient,
  input: OutboundEchoInput,
): Promise<{ created: boolean; messageId: string; conversationId: string }> {
  const messageType = mapWhatsAppMessageType(input.messageType);
  const textBody = messageType === "TEXT" ? input.textBody : null;
  const preview = buildMessagePreview(messageType, textBody, { caption: input.caption ?? null });

  const result = await withTransaction(prisma, async (tx) => {
    const identityKey = input.providerChatId || input.customerWaId;
    await acquireAdvisoryLock(tx, WHATSAPP_CONVERSATION_LOCK_NS, `${input.connectionId}:${identityKey}`);

    let conversation = await tx.whatsAppConversation.findFirst({
      where: { connectionId: input.connectionId, providerChatId: input.providerChatId },
    });
    if (!conversation) {
      conversation = await tx.whatsAppConversation.findUnique({
        where: {
          connectionId_customerWaId: {
            connectionId: input.connectionId,
            customerWaId: input.customerWaId,
          },
        },
      });
    }
    if (!conversation) {
      conversation = await tx.whatsAppConversation.create({
        data: {
          connectionId: input.connectionId,
          customerWaId: input.customerWaId,
          providerChatId: input.providerChatId,
          unreadCount: 0,
        },
      });
    } else if (!conversation.providerChatId) {
      conversation = await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { providerChatId: input.providerChatId },
      });
    }

    const inserted = await tx.whatsAppMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          connectionId: input.connectionId,
          providerMessageId: input.providerMessageId,
          direction: "OUTBOUND",
          messageType,
          textBody,
          caption: input.caption ?? null,
          mediaFilename: input.mediaFilename ?? null,
          displayPayload: input.source ? ({ source: input.source } as Prisma.InputJsonValue) : undefined,
          providerOccurredAt: input.providerOccurredAt,
          receivedAt: input.receivedAt,
          sendState: "ACCEPTED",
          providerStatus: "SENT",
          webhookEventId: input.webhookEventId,
        },
      ],
      skipDuplicates: true,
    });

    const message = await tx.whatsAppMessage.findFirstOrThrow({
      where: { connectionId: input.connectionId, providerMessageId: input.providerMessageId },
      select: { id: true, createdAt: true, providerOccurredAt: true },
    });

    if (inserted.count === 0) {
      await tx.whatsAppWebhookEvent.update({
        where: { id: input.webhookEventId },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
      return {
        created: false,
        messageId: message.id,
        conversationId: conversation.id,
        events: [] as WhatsAppRealtimeEvent[],
      };
    }

    const currentLast = conversation.lastMessageId
      ? await tx.whatsAppMessage.findUnique({
          where: { id: conversation.lastMessageId },
          select: { id: true, createdAt: true, providerOccurredAt: true },
        })
      : null;
    const newer = isNewerConversationMessage(
      {
        occurredAt: input.providerOccurredAt,
        createdAt: message.createdAt,
        id: message.id,
      },
      currentLast
        ? {
            occurredAt: currentLast.providerOccurredAt,
            createdAt: currentLast.createdAt,
            id: currentLast.id,
          }
        : null,
    );
    const outboundAt = input.providerOccurredAt ?? input.receivedAt;
    await tx.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastOutboundAt: outboundAt,
        ...(newer
          ? {
              lastMessageId: message.id,
              lastMessageAt: outboundAt,
              lastMessagePreview: preview,
              lastMessageType: messageType,
            }
          : {}),
      },
    });

    await tx.whatsAppWebhookEvent.update({
      where: { id: input.webhookEventId },
      data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
    });

    const createdEvent = await writeWhatsAppRealtimeEvent(tx, {
      type: "whatsapp.message.outbound_created",
      dedupeKey: `whatsapp.message.outbound_created:${message.id}`,
      conversationId: conversation.id,
      messageId: message.id,
      connectionId: input.connectionId,
    });
    return {
      created: true,
      messageId: message.id,
      conversationId: conversation.id,
      events: createdEvent ? [createdEvent] : [],
    };
  });

  publishWhatsAppRealtime(result.events);
  return {
    created: result.created,
    messageId: result.messageId,
    conversationId: result.conversationId,
  };
}
