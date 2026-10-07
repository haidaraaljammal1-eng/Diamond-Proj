import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { mapWhapiDeliveryStatus } from "src/modules/whatsapp/whapi.ack";
import {
  customerWaIdFromWhapiChatId,
  isWhapiDirectChatId,
  isWhapiGroupChatId,
} from "src/modules/whatsapp/whapi.chat-id";
import { mapWhatsAppMessageType } from "src/modules/whatsapp/whatsapp.message-type";
import type { WhatsAppMessageProviderStatus, WhatsAppWebhookEventType } from "@prisma/client";

export type WhapiWebhookKind = "message" | "status" | "unknown";

export interface ParsedWhapiWebhook {
  kind: WhapiWebhookKind;
  eventType: WhatsAppWebhookEventType;
  providerEventKey: string;
  channelId: string | null;
  providerMessageId: string | null;
  chatId: string | null;
  customerWaId: string | null;
  displayName: string | null;
  fromMe: boolean;
  isGroup: boolean;
  source: string | null;
  messageType: string | null;
  textBody: string | null;
  mediaFilename: string | null;
  caption: string | null;
  status: WhatsAppMessageProviderStatus | null;
  occurredAt: Date | null;
  ignoreReason: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function unixSeconds(value: unknown): Date | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n > 1_000_000_000_000) return new Date(n);
  if (n > 1_000_000_000) return new Date(n * 1000);
  return null;
}

function parseMessageRecord(message: Record<string, unknown>): Omit<
  ParsedWhapiWebhook,
  "kind" | "eventType" | "providerEventKey" | "channelId" | "status" | "ignoreReason"
> {
  const chatId = asString(message.chat_id) ?? asString(message.chatId);
  const fromMe = message.from_me === true || message.from_me === 1;
  const isGroup = isWhapiGroupChatId(chatId) || message.type === "group";
  const providerMessageId = asString(message.id);
  const typeRaw = asString(message.type) ?? "text";
  const mappedType = typeRaw === "chat" ? "text" : typeRaw;
  const textObj = asRecord(message.text);
  const textBody =
    mappedType === "text" ? asString(textObj?.body) ?? asString(message.body) : null;
  const caption =
    mappedType !== "text"
      ? asString(message.caption) ?? asString(textObj?.body) ?? asString(message.body)
      : null;
  const document = asRecord(message.document);
  const mediaFilename =
    asString(document?.filename) ?? asString(message.filename) ?? asString(message.file_name);
  return {
    providerMessageId,
    chatId,
    customerWaId: customerWaIdFromWhapiChatId(chatId),
    displayName: asString(message.from_name) ?? asString(message.pushname),
    fromMe,
    isGroup,
    source: asString(message.source),
    messageType: mapWhatsAppMessageType(mappedType),
    textBody,
    mediaFilename,
    caption,
    occurredAt: unixSeconds(message.timestamp) ?? unixSeconds(message.time),
  };
}

export function parseWhapiWebhook(json: unknown, envelopeHash: string): ParsedWhapiWebhook {
  const root = asRecord(json) ?? {};
  const channelId = asString(root.channel_id) ?? asString(root.channelId);
  const event = asRecord(root.event);
  const eventTypeRaw = `${asString(event?.type) ?? ""}:${asString(event?.event) ?? ""}`.toLowerCase();

  const statuses = Array.isArray(root.statuses) ? root.statuses : [];
  if (statuses.length > 0 || eventTypeRaw.includes("status")) {
    const statusRow = asRecord(statuses[0]) ?? {};
    const providerMessageId = asString(statusRow.id) ?? asString(statusRow.message_id);
    const status = mapWhapiDeliveryStatus(asString(statusRow.status) ?? asString(statusRow.state));
    const providerEventKey = providerMessageId
      ? `whapi:status:${providerMessageId}:${asString(statusRow.status) ?? envelopeHash}`
      : `whapi:status:${envelopeHash}`;
    return {
      kind: "status",
      eventType: "MESSAGE_STATUS",
      providerEventKey,
      channelId,
      providerMessageId,
      chatId: asString(statusRow.chat_id),
      customerWaId: null,
      displayName: null,
      fromMe: false,
      isGroup: false,
      source: null,
      messageType: null,
      textBody: null,
      mediaFilename: null,
      caption: null,
      status,
      occurredAt: unixSeconds(statusRow.timestamp),
      ignoreReason: status ? null : WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
    };
  }

  const messages = Array.isArray(root.messages) ? root.messages : [];
  const message = asRecord(messages[0]);
  if (!message) {
    return {
      kind: "unknown",
      eventType: "UNKNOWN",
      providerEventKey: `whapi:unknown:${envelopeHash}`,
      channelId,
      providerMessageId: null,
      chatId: null,
      customerWaId: null,
      displayName: null,
      fromMe: false,
      isGroup: false,
      source: null,
      messageType: null,
      textBody: null,
      mediaFilename: null,
      caption: null,
      status: null,
      occurredAt: null,
      ignoreReason: WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
    };
  }

  const parsedMessage = parseMessageRecord(message);
  const providerEventKey = parsedMessage.providerMessageId
    ? `whapi:message:${parsedMessage.providerMessageId}`
    : `whapi:message:${envelopeHash}`;

  let ignoreReason: string | null = null;
  if (parsedMessage.isGroup) ignoreReason = WhatsAppErrorReason.GROUP_NOT_SUPPORTED;
  else if (!isWhapiDirectChatId(parsedMessage.chatId)) {
    ignoreReason = WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING;
  } else if (!parsedMessage.customerWaId || !parsedMessage.providerMessageId) {
    ignoreReason = WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING;
  }

  return {
    kind: "message",
    eventType: "MESSAGE_RECEIVED",
    providerEventKey,
    channelId,
    ...parsedMessage,
    status: null,
    ignoreReason,
  };
}
