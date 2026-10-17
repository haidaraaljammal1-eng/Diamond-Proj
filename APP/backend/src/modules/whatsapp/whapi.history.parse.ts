import {
  conversationWaIdFromWhapiChatId,
  isWhapiDirectChatId,
  isWhapiGroupChatId,
} from "src/modules/whatsapp/whapi.chat-id";
import { readWhapiInboundMedia } from "src/modules/whatsapp/whapi.media-fields";

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

export interface ParsedWhapiHistoryMessage {
  providerMessageId: string;
  chatId: string;
  customerWaId: string;
  fromMe: boolean;
  messageType: string;
  textBody: string | null;
  caption: string | null;
  providerMediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  mediaSizeBytes: number | null;
  voiceNote: boolean;
  providerOccurredAt: Date | null;
  displayName: string | null;
  isGroup: boolean;
  senderDisplayName: string | null;
  senderProviderId: string | null;
  quotedProviderMessageId: string | null;
}

export function parseWhapiHistoryMessage(
  row: Record<string, unknown>,
  fallbackChatId: string,
  fallbackDisplayName: string | null,
): ParsedWhapiHistoryMessage | null {
  const chatId = asString(row.chat_id) ?? asString(row.chatId) ?? fallbackChatId;
  const isGroup = isWhapiGroupChatId(chatId);
  if (!isGroup && !isWhapiDirectChatId(chatId)) return null;
  const customerWaId = conversationWaIdFromWhapiChatId(chatId);
  const providerMessageId = asString(row.id);
  if (!customerWaId || !providerMessageId) return null;

  const fromMe = row.from_me === true || row.from_me === 1;
  const typeRaw = asString(row.type) ?? "text";
  const mappedType = typeRaw === "chat" ? "text" : typeRaw;
  const textObj = asRecord(row.text);
  const textBody =
    mappedType === "text" ? asString(textObj?.body) ?? asString(row.body) : null;
  const media = readWhapiInboundMedia(row);
  const caption =
    mappedType !== "text"
      ? asString(row.caption) ?? asString(textObj?.body) ?? media.caption
      : media.caption;

  return {
    providerMessageId,
    chatId,
    customerWaId,
    fromMe,
    messageType: mappedType,
    textBody,
    caption,
    providerMediaId: media.providerMediaId,
    mediaMimeType: media.mediaMimeType,
    mediaFilename: media.mediaFilename,
    mediaSizeBytes: media.mediaSizeBytes,
    voiceNote: media.voiceNote,
    providerOccurredAt: unixSeconds(row.timestamp) ?? unixSeconds(row.time),
    displayName: isGroup
      ? fallbackDisplayName
      : asString(row.from_name) ?? asString(row.pushname) ?? fallbackDisplayName,
    isGroup,
    senderDisplayName: isGroup
      ? asString(row.from_name) ?? asString(row.pushname) ?? asString(row.author)
      : null,
    senderProviderId: isGroup
      ? asString(row.author) ?? asString(row.from) ?? asString(row.from_id)
      : null,
    quotedProviderMessageId:
      asString(row.quoted_id) ??
      asString(asRecord(row.quoted)?.id) ??
      asString(asRecord(row.context)?.quoted_id),
  };
}
