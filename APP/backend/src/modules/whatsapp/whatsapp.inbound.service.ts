import type { Prisma, PrismaClient, WhatsAppMessageType } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { WHATSAPP_CONVERSATION_LOCK_NS } from "src/modules/whatsapp/whatsapp.constants";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import {
  buildMessagePreview,
  isNewerConversationMessage,
  mapWhatsAppMessageType,
  nextCustomerDisplayName,
} from "src/modules/whatsapp/whatsapp.message-type";

export interface InboundMessageInput {
  connectionId: string;
  customerWaId: string;
  /** Exact UltraMsg `@c.us` chat id when known. Null for historical Meta. */
  providerChatId?: string | null;
  customerDisplayName: string | null;
  providerMessageId: string;
  messageType: string | null;
  textBody: string | null;
  providerMediaId: string | null;
  caption?: string | null;
  mediaFilename?: string | null;
  mediaMimeType?: string | null;
  displayPayload?: Record<string, unknown> | null;
  providerOccurredAt: Date | null;
  receivedAt: Date;
  webhookEventId: string;
}

export type InboundMaterializeResult =
  | {
      created: true;
      conversationId: string;
      messageId: string;
      messageType: WhatsAppMessageType;
      conversationCreated: boolean;
    }
  | { created: false; conversationId: string; messageId: string };

let inboundFailureForTests: Error | undefined;
let inboundCommitFailureForTests: Error | undefined;

/** Test-only. Production refuses injection. Never logs message text. */
export function setWhatsAppInboundFailureForTests(error: Error | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp inbound failure injection is not allowed in production");
  }
  inboundFailureForTests = error;
}

/** Test-only. Throws after outbox write, before commit. */
export function setWhatsAppInboundCommitFailureForTests(error: Error | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp inbound commit failure injection is not allowed in production");
  }
  inboundCommitFailureForTests = error;
}

/**
 * Materialize a normalized inbound event into Conversation + Message.
 * Idempotent on (connectionId, providerMessageId). Unread increments only
 * when a new message row is inserted.
 */
export async function materializeInboundMessage(
  prisma: PrismaClient,
  input: InboundMessageInput,
): Promise<InboundMaterializeResult> {
  if (inboundFailureForTests && process.env.NODE_ENV !== "production") {
    throw inboundFailureForTests;
  }

  const messageType = mapWhatsAppMessageType(input.messageType);
  const textBody = messageType === "TEXT" ? input.textBody : null;
  const preview = buildMessagePreview(messageType, textBody, {
    caption: input.caption ?? null,
  });

  const result = await withTransaction(prisma, async (tx) => {
    const identityKey = input.providerChatId || input.customerWaId;
    await acquireAdvisoryLock(
      tx,
      WHATSAPP_CONVERSATION_LOCK_NS,
      `${input.connectionId}:${identityKey}`,
    );

    let conversation =
      input.providerChatId
        ? await tx.whatsAppConversation.findFirst({
            where: { connectionId: input.connectionId, providerChatId: input.providerChatId },
          })
        : null;
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
    let conversationCreated = false;
    if (!conversation) {
      try {
        conversation = await tx.whatsAppConversation.create({
          data: {
            connectionId: input.connectionId,
            customerWaId: input.customerWaId,
            providerChatId: input.providerChatId ?? null,
            customerDisplayName: nextCustomerDisplayName(null, input.customerDisplayName),
            unreadCount: 0,
          },
        });
        conversationCreated = true;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        conversation = await tx.whatsAppConversation.findUniqueOrThrow({
          where: {
            connectionId_customerWaId: {
              connectionId: input.connectionId,
              customerWaId: input.customerWaId,
            },
          },
        });
      }
    } else if (input.providerChatId && !conversation.providerChatId) {
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
          direction: "INBOUND",
          messageType,
          textBody,
          providerMediaId: input.providerMediaId,
          caption: input.caption ?? null,
          mediaFilename: input.mediaFilename ?? null,
          mediaMimeType: input.mediaMimeType ?? null,
          displayPayload: input.displayPayload
            ? (input.displayPayload as Prisma.InputJsonValue)
            : undefined,
          providerOccurredAt: input.providerOccurredAt,
          receivedAt: input.receivedAt,
          providerStatus: null,
          webhookEventId: input.webhookEventId,
        },
      ],
      skipDuplicates: true,
    });

    const message = await tx.whatsAppMessage.findFirstOrThrow({
      where: {
        connectionId: input.connectionId,
        providerMessageId: input.providerMessageId,
      },
      select: {
        id: true,
        createdAt: true,
        providerOccurredAt: true,
      },
    });

    if (inserted.count === 0) {
      await markWebhookProcessed(tx, input.webhookEventId);
      return {
        created: false as const,
        conversationId: conversation.id,
        messageId: message.id,
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

    const inboundAt = input.providerOccurredAt;
    await tx.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        unreadCount: { increment: 1 },
        customerDisplayName: nextCustomerDisplayName(
          conversation.customerDisplayName,
          input.customerDisplayName,
        ),
        ...(inboundAt &&
        (!conversation.lastInboundAt || inboundAt > conversation.lastInboundAt)
          ? { lastInboundAt: inboundAt }
          : {}),
        ...(newer
          ? {
              lastMessageId: message.id,
              lastMessageAt: inboundAt ?? input.receivedAt,
              lastMessagePreview: preview,
              lastMessageType: messageType,
            }
          : {}),
      },
    });

    await markWebhookProcessed(tx, input.webhookEventId);

    const events: WhatsAppRealtimeEvent[] = [];
    if (conversationCreated) {
      const createdEvent = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.conversation.created",
        dedupeKey: `whatsapp.conversation.created:${conversation.id}`,
        conversationId: conversation.id,
        connectionId: input.connectionId,
      });
      if (createdEvent) events.push(createdEvent);
    }
    const received = await writeWhatsAppRealtimeEvent(tx, {
      type: "whatsapp.message.received",
      dedupeKey: `whatsapp.message.received:${message.id}`,
      conversationId: conversation.id,
      messageId: message.id,
      connectionId: input.connectionId,
    });
    if (received) events.push(received);

    if (inboundCommitFailureForTests && process.env.NODE_ENV !== "production") {
      throw inboundCommitFailureForTests;
    }

    return {
      created: true as const,
      conversationId: conversation.id,
      messageId: message.id,
      messageType,
      conversationCreated,
      events,
    };
  });

  publishWhatsAppRealtime(result.events);
  if (result.created) {
    return {
      created: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
      messageType: result.messageType,
      conversationCreated: result.conversationCreated,
    };
  }
  return {
    created: false,
    conversationId: result.conversationId,
    messageId: result.messageId,
  };
}

async function markWebhookProcessed(tx: Tx, webhookEventId: string): Promise<void> {
  await tx.whatsAppWebhookEvent.update({
    where: { id: webhookEventId },
    data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
  });
}
