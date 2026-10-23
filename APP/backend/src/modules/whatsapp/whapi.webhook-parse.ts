import { createHash } from "node:crypto";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { mapWhapiDeliveryStatus } from "src/modules/whatsapp/whapi.ack";
import {
  conversationWaIdFromWhapiChatId,
  customerWaIdFromWhapiChatId,
  isWhapiDirectChatId,
  isWhapiGroupChatId,
} from "src/modules/whatsapp/whapi.chat-id";
import { readWhapiInboundMedia } from "src/modules/whatsapp/whapi.media-fields";
import { mapWhatsAppMessageType } from "src/modules/whatsapp/whatsapp.message-type";
import type { WhatsAppMessageProviderStatus, WhatsAppWebhookEventType } from "@prisma/client";

export type WhapiWebhookKind = "message" | "status" | "unknown";
export type WhapiWebhookAction = "create" | "update" | "delete";

export interface ParsedWhapiWebhook {
  kind: WhapiWebhookKind;
  action: WhapiWebhookAction;
  eventType: WhatsAppWebhookEventType;
  providerEventKey: string;
  channelId: string | null;
  providerMessageId: string | null;
  chatId: string | null;
  customerWaId: string | null;
  displayName: string | null;
  fromMe: boolean;
  isGroup: boolean;
  senderProviderId: string | null;
  quotedProviderMessageId: string | null;
  source: string | null;
  messageType: string | null;
  textBody: string | null;
  mediaFilename: string | null;
  caption: string | null;
  providerMediaId: string | null;
  mediaMimeType: string | null;
  mediaSizeBytes: number | null;
  voiceNote: boolean;
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

/** Item-level channel when Whapi includes it; otherwise envelope channel_id. */
export function resolveWhapiWebhookItemChannelId(
  item: Record<string, unknown>,
  envelopeChannelId: string | null,
): string | null {
  return asString(item.channel_id) ?? asString(item.channelId) ?? envelopeChannelId;
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
  "kind" | "action" | "eventType" | "providerEventKey" | "channelId" | "status" | "ignoreReason"
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
  const media = readWhapiInboundMedia(message);
  const quotedProviderMessageId =
    asString(message.quoted_id) ??
    asString(asRecord(message.quoted)?.id) ??
    asString(asRecord(message.context)?.quoted_id);
  return {
    providerMessageId,
    chatId,
    customerWaId: conversationWaIdFromWhapiChatId(chatId),
    displayName: asString(message.from_name) ?? asString(message.pushname),
    fromMe,
    isGroup,
    senderProviderId: isGroup
      ? asString(message.author) ?? asString(message.from) ?? asString(message.from_id)
      : null,
    quotedProviderMessageId,
    source: asString(message.source),
    messageType: mapWhatsAppMessageType(mappedType),
    textBody,
    mediaFilename: media.mediaFilename,
    caption: media.caption ?? caption,
    providerMediaId: media.providerMediaId,
    mediaMimeType: media.mediaMimeType,
    mediaSizeBytes: media.mediaSizeBytes,
    voiceNote: media.voiceNote,
    occurredAt: unixSeconds(message.timestamp) ?? unixSeconds(message.time),
  };
}

function actionFromName(name: string): WhapiWebhookAction {
  const normalized = name.toLowerCase();
  if (normalized === "delete" || normalized === "remove" || normalized.includes("delete")) return "delete";
  if (
    normalized === "patch" ||
    normalized === "put" ||
    normalized === "edit" ||
    normalized.includes("edit")
  ) {
    return "update";
  }
  return "create";
}

function readEnvelopeAction(root: Record<string, unknown>): WhapiWebhookAction {
  const event = asRecord(root.event);
  const name = asString(event?.event) ?? "post";
  return actionFromName(name);
}

function readMessageAction(
  message: Record<string, unknown>,
  fallback: WhapiWebhookAction,
): WhapiWebhookAction {
  const name = asString(message.action);
  if (!name) return fallback;
  return actionFromName(name);
}

function messageEventKey(
  providerMessageId: string | null,
  action: WhapiWebhookAction,
  occurredAt: Date | null,
  textBody: string | null,
  caption: string | null,
  envelopeHash: string,
): string {
  if (!providerMessageId) return `whapi:message:${action}:${envelopeHash}`;
  if (action === "delete") return `whapi:message:${providerMessageId}:delete`;
  if (action === "update") {
    const stamp = occurredAt ? String(Math.floor(occurredAt.getTime() / 1000)) : "na";
    const digest = createHash("sha256")
      .update(`${textBody ?? ""}\n${caption ?? ""}`)
      .digest("hex")
      .slice(0, 12);
    return `whapi:message:${providerMessageId}:update:${stamp}:${digest}`;
  }
  return `whapi:message:${providerMessageId}`;
}

function parseStatusItem(
  statusRow: Record<string, unknown>,
  channelId: string | null,
  envelopeHash: string,
): ParsedWhapiWebhook {
  const providerMessageId = asString(statusRow.id) ?? asString(statusRow.message_id);
  const rawStatus = asString(statusRow.status) ?? asString(statusRow.state);
  const status = mapWhapiDeliveryStatus(rawStatus);
  const providerEventKey = providerMessageId
    ? `whapi:status:${providerMessageId}:${rawStatus ?? envelopeHash}`
    : `whapi:status:${envelopeHash}`;
  return {
    kind: "status",
    action: "create",
    eventType: "MESSAGE_STATUS",
    providerEventKey,
    channelId,
    providerMessageId,
    chatId: asString(statusRow.chat_id),
    customerWaId: null,
    displayName: null,
    fromMe: false,
    isGroup: false,
    senderProviderId: null,
    quotedProviderMessageId: null,
    source: null,
    messageType: null,
    textBody: null,
    mediaFilename: null,
    caption: null,
    providerMediaId: null,
    mediaMimeType: null,
    mediaSizeBytes: null,
    voiceNote: false,
    status,
    occurredAt: unixSeconds(statusRow.timestamp),
    ignoreReason: status ? null : WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
  };
}

function parseMessageItem(
  message: Record<string, unknown>,
  channelId: string | null,
  action: WhapiWebhookAction,
  envelopeHash: string,
): ParsedWhapiWebhook {
  const parsedMessage = parseMessageRecord(message);
  let ignoreReason: string | null = null;
  if (
    !parsedMessage.isGroup &&
    !isWhapiDirectChatId(parsedMessage.chatId)
  ) {
    ignoreReason = WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING;
  } else if (!parsedMessage.customerWaId || !parsedMessage.providerMessageId) {
    ignoreReason = WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING;
  }
  return {
    kind: "message",
    action,
    eventType: "MESSAGE_RECEIVED",
    providerEventKey: messageEventKey(
      parsedMessage.providerMessageId,
      action,
      parsedMessage.occurredAt,
      parsedMessage.textBody,
      parsedMessage.caption,
      envelopeHash,
    ),
    channelId,
    ...parsedMessage,
    status: null,
    ignoreReason,
  };
}

function unknownEvent(channelId: string | null, envelopeHash: string): ParsedWhapiWebhook {
  return {
    kind: "unknown",
    action: "create",
    eventType: "UNKNOWN",
    providerEventKey: `whapi:unknown:${envelopeHash}`,
    channelId,
    providerMessageId: null,
    chatId: null,
    customerWaId: null,
    displayName: null,
    fromMe: false,
    isGroup: false,
    senderProviderId: null,
    quotedProviderMessageId: null,
    source: null,
    messageType: null,
    textBody: null,
    mediaFilename: null,
    caption: null,
    providerMediaId: null,
    mediaMimeType: null,
    mediaSizeBytes: null,
    voiceNote: false,
    status: null,
    occurredAt: null,
    ignoreReason: WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
  };
}

/** Every `messages[]` and `statuses[]` element. The first element is not a stand-in for the batch. */
export function parseWhapiWebhookBatch(json: unknown, envelopeHash: string): ParsedWhapiWebhook[] {
  const root = asRecord(json);
  if (!root) return [unknownEvent(null, envelopeHash)];
  const channelId = asString(root.channel_id) ?? asString(root.channelId);
  const envelopeAction = readEnvelopeAction(root);
  const statuses = Array.isArray(root.statuses) ? root.statuses : [];
  const messages = Array.isArray(root.messages) ? root.messages : [];
  const events: ParsedWhapiWebhook[] = [];
  for (const item of statuses) {
    const row = asRecord(item) ?? {};
    events.push(
      parseStatusItem(row, resolveWhapiWebhookItemChannelId(row, channelId), envelopeHash),
    );
  }
  for (const item of messages) {
    const message = asRecord(item);
    if (!message) continue;
    events.push(
      parseMessageItem(
        message,
        resolveWhapiWebhookItemChannelId(message, channelId),
        readMessageAction(message, envelopeAction),
        envelopeHash,
      ),
    );
  }
  if (events.length > 0) return events;
  const event = asRecord(root.event);
  const typeName = (asString(event?.type) ?? "").toLowerCase();
  if (typeName.includes("status")) return [parseStatusItem({}, channelId, envelopeHash)];
  return [unknownEvent(channelId, envelopeHash)];
}

export function parseWhapiWebhook(json: unknown, envelopeHash: string): ParsedWhapiWebhook {
  return parseWhapiWebhookBatch(json, envelopeHash)[0]!;
}
