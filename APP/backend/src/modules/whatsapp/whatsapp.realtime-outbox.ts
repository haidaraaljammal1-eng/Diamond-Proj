import type { PrismaClient } from "@prisma/client";
import { writeOutboxEvent } from "src/lib/db/outbox";
import type { Tx } from "src/lib/db/transaction";
import {
  WHATSAPP_REALTIME_EVENT_PREFIX,
  WHATSAPP_REALTIME_RETENTION_MS,
} from "src/modules/whatsapp/whatsapp.constants";
import {
  isWhatsAppRealtimeType,
  type WhatsAppRealtimeEvent,
  type WhatsAppRealtimeProviderStatus,
  type WhatsAppRealtimeSendState,
  type WhatsAppRealtimeType,
} from "src/modules/whatsapp/whatsapp.realtime";

export interface WhatsAppRealtimeWriteInput {
  type: WhatsAppRealtimeType;
  dedupeKey: string;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  sendState?: WhatsAppRealtimeSendState;
  providerStatus?: WhatsAppRealtimeProviderStatus;
  occurredAt?: Date;
}

/**
 * Write a WhatsApp realtime notification inside the same DB transaction as the
 * domain change. Returns null when the dedupe key already exists (no new event).
 */
export async function writeWhatsAppRealtimeEvent(
  tx: Tx,
  input: WhatsAppRealtimeWriteInput,
): Promise<WhatsAppRealtimeEvent | null> {
  const occurredAt = (input.occurredAt ?? new Date()).toISOString();
  const payload: Record<string, unknown> = {
    type: input.type,
    occurredAt,
  };
  if (input.conversationId) payload.conversationId = input.conversationId;
  if (input.messageId) payload.messageId = input.messageId;
  if (input.connectionId) payload.connectionId = input.connectionId;
  if (input.sendState) payload.sendState = input.sendState;
  if (input.providerStatus) payload.providerStatus = input.providerStatus;

  const row = await writeOutboxEvent(tx, {
    eventType: input.type,
    aggregateType: input.messageId ? "WhatsAppMessage" : input.conversationId ? "WhatsAppConversation" : "WhatsAppConnection",
    aggregateId: input.messageId ?? input.conversationId ?? input.connectionId ?? "office",
    dedupeKey: input.dedupeKey,
    payload,
  });
  if (!row) return null;
  return {
    eventId: String(row.id),
    type: input.type,
    conversationId: input.conversationId,
    messageId: input.messageId,
    connectionId: input.connectionId,
    occurredAt,
    sendState: input.sendState,
    providerStatus: input.providerStatus,
  };
}

export async function listWhatsAppRealtimeSince(
  prisma: PrismaClient,
  afterId: number,
  limit = 100,
): Promise<WhatsAppRealtimeEvent[]> {
  const cutoff = new Date(Date.now() - WHATSAPP_REALTIME_RETENTION_MS);
  const rows = await prisma.domainOutboxEvent.findMany({
    where: {
      id: { gt: afterId },
      eventType: { startsWith: WHATSAPP_REALTIME_EVENT_PREFIX },
      createdAt: { gte: cutoff },
    },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, eventType: true, payload: true, createdAt: true },
  });
  return rows.map(toEnvelope).filter((row): row is WhatsAppRealtimeEvent => row !== null);
}

export async function latestWhatsAppRealtimeId(prisma: PrismaClient): Promise<number> {
  const row = await prisma.domainOutboxEvent.findFirst({
    where: { eventType: { startsWith: WHATSAPP_REALTIME_EVENT_PREFIX } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return row?.id ?? 0;
}

export async function purgeExpiredWhatsAppRealtimeEvents(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - WHATSAPP_REALTIME_RETENTION_MS);
  const result = await prisma.domainOutboxEvent.deleteMany({
    where: {
      eventType: { startsWith: WHATSAPP_REALTIME_EVENT_PREFIX },
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}

function toEnvelope(row: {
  id: number;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}): WhatsAppRealtimeEvent | null {
  if (!isWhatsAppRealtimeType(row.eventType)) return null;
  const payload =
    row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  return {
    eventId: String(row.id),
    type: row.eventType,
    conversationId: asId(payload.conversationId),
    messageId: asId(payload.messageId),
    connectionId: asId(payload.connectionId),
    occurredAt: typeof payload.occurredAt === "string" ? payload.occurredAt : row.createdAt.toISOString(),
    sendState: asSendState(payload.sendState),
    providerStatus: asProviderStatus(payload.providerStatus),
  };
}

function asId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asSendState(value: unknown): WhatsAppRealtimeEvent["sendState"] {
  if (value === "PENDING" || value === "ACCEPTED" || value === "FAILED" || value === "UNKNOWN") {
    return value;
  }
  return undefined;
}

function asProviderStatus(value: unknown): WhatsAppRealtimeEvent["providerStatus"] {
  if (value === "SENT" || value === "DELIVERED" || value === "READ" || value === "FAILED") {
    return value;
  }
  return undefined;
}
