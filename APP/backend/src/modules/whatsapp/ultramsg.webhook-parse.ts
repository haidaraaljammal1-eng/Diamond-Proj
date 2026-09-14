import { timingSafeEqual } from "node:crypto";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { isUltraMsgContactChatId, isUltraMsgGroupChatId, digitsFromUltraMsgContactChatId } from "src/modules/whatsapp/ultramsg.chat-id";
import { mapUltraMsgAck } from "src/modules/whatsapp/ultramsg.ack";
import { mapWhatsAppMessageType } from "src/modules/whatsapp/whatsapp.message-type";
import type { WhatsAppMessageProviderStatus, WhatsAppWebhookEventType } from "@prisma/client";

export type UltraMsgWebhookKind = "message_received" | "message_create" | "message_ack" | "unknown";

export interface ParsedUltraMsgWebhook {
  kind: UltraMsgWebhookKind;
  eventType: WhatsAppWebhookEventType;
  providerEventKey: string;
  instanceId: string | null;
  hash: string | null;
  providerMessageId: string | null;
  chatId: string | null;
  customerWaId: string | null;
  displayName: string | null;
  fromMe: boolean;
  isGroup: boolean;
  messageType: string | null;
  textBody: string | null;
  mediaUrl: string | null;
  mediaFilename: string | null;
  caption: string | null;
  ack: WhatsAppMessageProviderStatus | null;
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
  if (!Number.isFinite(n) || n < 1_000_000_000 || n > 9_999_999_999) return null;
  return new Date(n * 1000);
}

export function timingSafeCallbackKey(expected: string, incoming: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(incoming);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseUltraMsgWebhook(json: unknown, envelopeHash: string): ParsedUltraMsgWebhook {
  const root = asRecord(json);
  const data = asRecord(root?.data) ?? {};
  const eventTypeRaw = asString(root?.event_type)?.toLowerCase() ?? "";
  const instanceId = asString(root?.instanceId) ?? asString(root?.instance_id);
  const hash = asString(root?.hash);
  const providerMessageId = asString(data.id) ?? asString(root?.id);
  const from = asString(data.from);
  const to = asString(data.to);
  const fromMe = data.fromMe === true || data.fromMe === "true";
  const chatId = fromMe ? to ?? from : from ?? to;
  const isGroup = isUltraMsgGroupChatId(chatId);
  const customerWaId = chatId && isUltraMsgContactChatId(chatId) ? digitsFromUltraMsgContactChatId(chatId) : null;
  const kind: UltraMsgWebhookKind =
    eventTypeRaw === "message_received" || eventTypeRaw === "message_create" || eventTypeRaw === "message_ack"
      ? eventTypeRaw
      : "unknown";
  const diamondType: WhatsAppWebhookEventType =
    kind === "message_ack" ? "MESSAGE_STATUS" : kind === "unknown" ? "UNKNOWN" : "MESSAGE_RECEIVED";
  const providerEventKey = hash
    ? `ultramsg:hash:${hash}`
    : `ultramsg:${kind}:${providerMessageId ?? envelopeHash}:${asString(data.ack) ?? "none"}`;

  let ignoreReason: string | null = null;
  if (kind === "unknown") ignoreReason = WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT;
  else if (isGroup) ignoreReason = WhatsAppErrorReason.GROUP_NOT_SUPPORTED;
  else if (kind === "message_received" && fromMe) ignoreReason = WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT;
  else if ((kind === "message_received" || kind === "message_create") && !isUltraMsgContactChatId(chatId)) {
    ignoreReason = WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING;
  }

  const typeRaw = asString(data.type);
  const mappedType = typeRaw === "chat" || typeRaw === "conversation" ? "text" : typeRaw;
  const body = asString(data.body);
  const media = asString(data.media);
  const filename = asString(data.filename) ?? asString(data.fileName);

  return {
    kind,
    eventType: diamondType,
    providerEventKey,
    instanceId,
    hash,
    providerMessageId,
    chatId,
    customerWaId,
    displayName: asString(data.pushname) ?? asString(data.pushName),
    fromMe,
    isGroup,
    messageType: mappedType ? mapWhatsAppMessageType(mappedType) : null,
    textBody: mappedType === "text" || typeRaw === "chat" ? body : null,
    mediaUrl: media && /^https?:\/\//i.test(media) ? media : null,
    mediaFilename: filename,
    caption: mappedType && mappedType !== "text" ? body : null,
    ack: mapUltraMsgAck(asString(data.ack)),
    occurredAt: unixSeconds(data.time),
    ignoreReason,
  };
}
