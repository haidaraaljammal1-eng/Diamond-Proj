import type { Prisma, PrismaClient } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { WHATSAPP_CONVERSATION_LOCK_NS } from "src/modules/whatsapp/whatsapp.constants";
import { buildMessagePreview } from "src/modules/whatsapp/whatsapp.message-type";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";

export type WhapiRevisionAction = "update" | "delete";

export function mergeWhapiRevision(
  current: unknown,
  revision: { editedAt?: string | null; revokedAt?: string | null },
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  const previous = base.whapi;
  const whapi =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? { ...(previous as Record<string, unknown>) }
      : {};
  if (revision.editedAt) whapi.editedAt = revision.editedAt;
  if (revision.revokedAt) whapi.revokedAt = revision.revokedAt;
  base.whapi = whapi;
  return base as Prisma.InputJsonValue;
}

export function readWhapiRevisionFlags(payload: unknown): { edited: boolean; revoked: boolean } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { edited: false, revoked: false };
  }
  const whapi = (payload as Record<string, unknown>).whapi;
  if (!whapi || typeof whapi !== "object" || Array.isArray(whapi)) {
    return { edited: false, revoked: false };
  }
  const row = whapi as Record<string, unknown>;
  return {
    edited: typeof row.editedAt === "string" && row.editedAt.length > 0,
    revoked: typeof row.revokedAt === "string" && row.revokedAt.length > 0,
  };
}

export async function applyWhapiMessageRevision(
  prisma: PrismaClient,
  input: {
    connectionId: string;
    providerMessageId: string;
    action: WhapiRevisionAction;
    textBody: string | null;
    caption: string | null;
    occurredAt: Date | null;
    webhookEventId: string;
  },
): Promise<"applied" | "waiting"> {
  const result = await withTransaction(prisma, async (tx) => {
    const existingEvent = await tx.whatsAppWebhookEvent.findUnique({
      where: { id: input.webhookEventId },
      select: { status: true },
    });
    if (!existingEvent || existingEvent.status === "PROCESSED" || existingEvent.status === "IGNORED") {
      return { state: "applied" as const, events: [] as WhatsAppRealtimeEvent[] };
    }

    const located = await tx.whatsAppMessage.findFirst({
      where: { connectionId: input.connectionId, providerMessageId: input.providerMessageId },
      select: { id: true, conversationId: true },
    });
    if (!located) return { state: "waiting" as const, events: [] as WhatsAppRealtimeEvent[] };

    const conversation = await tx.whatsAppConversation.findUnique({
      where: { id: located.conversationId },
      select: { id: true, providerChatId: true, customerWaId: true, lastMessageId: true },
    });
    if (!conversation) return { state: "waiting" as const, events: [] as WhatsAppRealtimeEvent[] };

    await acquireAdvisoryLock(
      tx,
      WHATSAPP_CONVERSATION_LOCK_NS,
      `${input.connectionId}:${conversation.providerChatId || conversation.customerWaId}`,
    );

    const message = await tx.whatsAppMessage.findFirst({
      where: { connectionId: input.connectionId, providerMessageId: input.providerMessageId },
      select: {
        id: true,
        conversationId: true,
        messageType: true,
        textBody: true,
        caption: true,
        displayPayload: true,
      },
    });
    if (!message) return { state: "waiting" as const, events: [] as WhatsAppRealtimeEvent[] };

    const stamp = (input.occurredAt ?? new Date()).toISOString();
    const revoked = input.action === "delete";
    const nextText = revoked
      ? null
      : input.action === "update" && message.messageType === "TEXT" && input.textBody !== null
        ? input.textBody
        : message.textBody;
    const nextCaption = revoked ? null : input.caption ?? message.caption;
    const displayPayload = mergeWhapiRevision(message.displayPayload, {
      editedAt: revoked ? null : stamp,
      revokedAt: revoked ? stamp : null,
    });

    await tx.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        textBody: nextText,
        caption: nextCaption,
        displayPayload,
      },
    });

    if (conversation.lastMessageId === message.id) {
      const preview = revoked
        ? ""
        : buildMessagePreview(message.messageType, nextText, { caption: nextCaption });
      await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { lastMessagePreview: preview },
      });
    }

    await tx.whatsAppWebhookEvent.update({
      where: { id: input.webhookEventId },
      data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
    });

    const realtime = await writeWhatsAppRealtimeEvent(tx, {
      type: "whatsapp.message.updated",
      dedupeKey: `whatsapp.message.updated:${message.id}:${input.webhookEventId}`,
      conversationId: conversation.id,
      messageId: message.id,
      connectionId: input.connectionId,
    });
    return {
      state: "applied" as const,
      events: realtime ? [realtime] : [],
    };
  });

  publishWhatsAppRealtime(result.events);
  return result.state;
}

/** Apply edit/delete webhooks that arrived before the message row existed. */
export async function applyDeferredMessageRevisions(
  prisma: PrismaClient,
  connectionId: string,
  providerMessageId: string,
): Promise<void> {
  const pending = await prisma.whatsAppWebhookEvent.findMany({
    where: {
      connectionId,
      providerMessageId,
      status: "RECEIVED",
      OR: [
        { providerEventKey: { contains: ":update:" } },
        { providerEventKey: { endsWith: ":delete" } },
      ],
    },
    select: {
      id: true,
      providerEventKey: true,
      textBody: true,
      occurredAt: true,
      payload: true,
    },
  });
  const ordered = [...pending].sort((left, right) => {
    const leftDelete = left.providerEventKey.endsWith(":delete") ? 1 : 0;
    const rightDelete = right.providerEventKey.endsWith(":delete") ? 1 : 0;
    if (leftDelete !== rightDelete) return leftDelete - rightDelete;
    return (left.occurredAt?.getTime() ?? 0) - (right.occurredAt?.getTime() ?? 0);
  });
  for (const event of ordered) {
    const action: WhapiRevisionAction = event.providerEventKey.endsWith(":delete") ? "delete" : "update";
    await applyWhapiMessageRevision(prisma, {
      connectionId,
      providerMessageId,
      action,
      textBody: event.textBody,
      caption: captionFromPayload(event.payload, providerMessageId),
      occurredAt: event.occurredAt,
      webhookEventId: event.id,
    });
  }
}

function nestedCaption(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const caption = (value as Record<string, unknown>).caption;
  return typeof caption === "string" ? caption : null;
}

function captionFromPayload(payload: unknown, providerMessageId: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const messages = (payload as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return null;
  for (const item of messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (row.id !== providerMessageId) continue;
    return (
      (typeof row.caption === "string" ? row.caption : null) ??
      nestedCaption(row.image) ??
      nestedCaption(row.video) ??
      nestedCaption(row.document)
    );
  }
  return null;
}
