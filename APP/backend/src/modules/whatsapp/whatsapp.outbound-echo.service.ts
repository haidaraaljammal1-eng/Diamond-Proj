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
  providerMediaId?: string | null;
  mediaMimeType?: string | null;
  voiceNote?: boolean;
  providerOccurredAt: Date | null;
  receivedAt: Date;
  webhookEventId?: string | null;
  source?: string | null;
  /** Backfill only: no SSE and no delivery state on phone-originated rows. */
  historical?: boolean;
}

function echoDisplayPayload(input: OutboundEchoInput): Prisma.InputJsonValue {
  const payload: { source?: string; whapi?: { voice: true } } = {};
  payload.source = input.source ?? (input.historical ? "history_import" : undefined);
  if (input.voiceNote) payload.whapi = { voice: true };
  return payload;
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
          providerMediaId: input.providerMediaId ?? null,
          mediaMimeType: input.mediaMimeType ?? null,
          displayPayload: echoDisplayPayload(input) as Prisma.InputJsonValue,
          providerOccurredAt: input.providerOccurredAt,
          receivedAt: input.receivedAt,
          sendState: input.historical ? null : "ACCEPTED",
          providerStatus: input.historical ? null : "SENT",
          webhookEventId: input.webhookEventId ?? null,
        },
      ],
      skipDuplicates: true,
    });

    const message = await tx.whatsAppMessage.findFirstOrThrow({
      where: { connectionId: input.connectionId, providerMessageId: input.providerMessageId },
      select: { id: true, createdAt: true, providerOccurredAt: true },
    });

    if (inserted.count === 0) {
      if (input.webhookEventId) {
        await tx.whatsAppWebhookEvent.update({
          where: { id: input.webhookEventId },
          data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
        });
      }
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
    if (newer) {
      await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          lastOutboundAt: outboundAt,
          lastMessageId: message.id,
          lastMessageAt: outboundAt,
          lastMessagePreview: preview,
          lastMessageType: messageType,
        },
      });
    }

    if (input.webhookEventId) {
      await tx.whatsAppWebhookEvent.update({
        where: { id: input.webhookEventId },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
    }

    if (input.historical) {
      return {
        created: true,
        messageId: message.id,
        conversationId: conversation.id,
        events: [] as WhatsAppRealtimeEvent[],
      };
    }

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

  if (!input.historical) publishWhatsAppRealtime(result.events);
  return {
    created: result.created,
    messageId: result.messageId,
    conversationId: result.conversationId,
  };
}
