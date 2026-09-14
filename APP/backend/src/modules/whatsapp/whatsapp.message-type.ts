import type {
  WhatsAppMessageProviderStatus,
  WhatsAppMessageType,
} from "@prisma/client";
import { WHATSAPP_MESSAGE_PREVIEW_MAX } from "src/modules/whatsapp/whatsapp.constants";

const TYPE_MAP: Record<string, WhatsAppMessageType> = {
  text: "TEXT",
  chat: "TEXT",
  image: "IMAGE",
  document: "DOCUMENT",
  audio: "AUDIO",
  ptt: "AUDIO",
  voice: "AUDIO",
  video: "VIDEO",
  location: "LOCATION",
  contacts: "CONTACTS",
  interactive: "INTERACTIVE",
  reaction: "REACTION",
  sticker: "STICKER",
  template: "TEMPLATE",
};

const STATUS_MAP: Record<string, WhatsAppMessageProviderStatus> = {
  pending: "PENDING",
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

export function mapWhatsAppMessageType(providerType: string | null | undefined): WhatsAppMessageType {
  if (!providerType) return "UNKNOWN";
  return TYPE_MAP[providerType.trim().toLowerCase()] ?? "UNKNOWN";
}

export function mapWhatsAppProviderStatus(
  providerStatus: string | null | undefined,
): WhatsAppMessageProviderStatus | null {
  if (!providerStatus) return null;
  return STATUS_MAP[providerStatus.trim().toLowerCase()] ?? null;
}

/** Neutral preview. No HTML. No localized presentation strings. */
export function buildMessagePreview(
  messageType: WhatsAppMessageType,
  textBody: string | null,
  extras?: {
    caption?: string | null;
    templatePreview?: string | null;
    templateName?: string | null;
  },
): string | null {
  const source =
    messageType === "TEXT"
      ? textBody
      : messageType === "TEMPLATE"
        ? extras?.templatePreview || extras?.templateName || null
        : extras?.caption || null;
  if (!source) return null;
  const plain = source.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  if (plain.length <= WHATSAPP_MESSAGE_PREVIEW_MAX) return plain;
  return `${plain.slice(0, WHATSAPP_MESSAGE_PREVIEW_MAX)}…`;
}

export function nextCustomerDisplayName(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = typeof incoming === "string" ? incoming.trim() : "";
  if (next.length === 0) return current ?? null;
  return next;
}

export interface MessageChronology {
  occurredAt: Date | null;
  createdAt: Date;
  id: string;
}

/**
 * True when incoming should become the conversation last-message.
 * Primary: providerOccurredAt. Tie: createdAt then stable id.
 * Undated incoming never replaces a dated last message.
 */
export function isNewerConversationMessage(
  incoming: MessageChronology,
  current: MessageChronology | null,
): boolean {
  if (!current) return true;
  const a = incoming.occurredAt?.getTime() ?? null;
  const b = current.occurredAt?.getTime() ?? null;
  if (a !== null && b !== null) {
    if (a !== b) return a > b;
  } else if (a !== null && b === null) {
    return true;
  } else if (a === null && b !== null) {
    return false;
  }
  const created = incoming.createdAt.getTime() - current.createdAt.getTime();
  if (created !== 0) return created > 0;
  return incoming.id > current.id;
}
