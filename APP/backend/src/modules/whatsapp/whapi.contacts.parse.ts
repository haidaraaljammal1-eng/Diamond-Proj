import {
  customerWaIdFromWhapiChatId,
  isWhapiDirectChatId,
  isWhapiGroupChatId,
} from "src/modules/whatsapp/whapi.chat-id";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export type ParsedWhapiContact = {
  providerContactId: string;
  whapiDisplayName: string | null;
  hasProfilePicture: boolean;
};

export function contactIdFromWhapiRow(row: Record<string, unknown>): string | null {
  return (
    asString(row.id) ??
    asString(row.wa_id) ??
    asString(row.waId) ??
    asString(row.chat_id) ??
    asString(row.chatId)
  );
}

export function parseWhapiContactRow(row: Record<string, unknown>): ParsedWhapiContact | null {
  const providerContactId = contactIdFromWhapiRow(row);
  if (!providerContactId || isWhapiGroupChatId(providerContactId)) return null;
  if (!isWhapiDirectChatId(providerContactId)) return null;
  if (!customerWaIdFromWhapiChatId(providerContactId)) return null;

  const name =
    asString(row.name) ??
    asString(row.pushname) ??
    asString(row.short_name) ??
    asString(asRecord(row.profile)?.name);

  const icon =
    asString(row.profile_pic) ??
    asString(row.profile_picture) ??
    asString(asRecord(row.profile)?.picture) ??
    asString(row.icon);

  return {
    providerContactId,
    whapiDisplayName: name,
    hasProfilePicture: Boolean(icon && icon !== "null" && icon !== "none"),
  };
}
