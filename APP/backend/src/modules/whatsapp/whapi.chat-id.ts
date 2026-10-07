const PHONE_SUFFIX = "@s.whatsapp.net";
const LID_SUFFIX = "@lid";
const GROUP_SUFFIX = "@g.us";

export function isWhapiGroupChatId(chatId: string | null | undefined): boolean {
  const value = chatId?.trim().toLowerCase() ?? "";
  return value.endsWith(GROUP_SUFFIX) || value.includes("@g.us");
}

export function isWhapiLidChatId(chatId: string | null | undefined): boolean {
  return typeof chatId === "string" && chatId.trim().toLowerCase().endsWith(LID_SUFFIX);
}

export function isWhapiPhoneChatId(chatId: string | null | undefined): boolean {
  return typeof chatId === "string" && chatId.trim().toLowerCase().endsWith(PHONE_SUFFIX);
}

/** Strip terminal `@s.whatsapp.net` only. */
export function digitsFromWhapiPhoneChatId(chatId: string): string | null {
  const trimmed = chatId.trim();
  if (!trimmed.toLowerCase().endsWith(PHONE_SUFFIX)) return null;
  const digits = trimmed.slice(0, -PHONE_SUFFIX.length).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function whapiPhoneChatIdFromDigits(digits: string): string | null {
  const value = digits.trim().replace(/\D/g, "");
  if (!/^\d+$/.test(value)) return null;
  return `${value}${PHONE_SUFFIX}`;
}

/**
 * Diamond customerWaId: digits when safely derivable from phone chat id.
 * For `@lid` and other opaque ids, use the full chat id (never guess a phone).
 */
export function customerWaIdFromWhapiChatId(chatId: string | null | undefined): string | null {
  const stored = chatId?.trim() ?? "";
  if (!stored || isWhapiGroupChatId(stored)) return null;
  if (isWhapiPhoneChatId(stored)) return digitsFromWhapiPhoneChatId(stored);
  if (isWhapiLidChatId(stored)) return stored;
  if (/^\d+$/.test(stored)) return stored;
  return stored.length > 0 ? stored : null;
}

export function isWhapiDirectChatId(chatId: string | null | undefined): boolean {
  const stored = chatId?.trim() ?? "";
  if (!stored || isWhapiGroupChatId(stored)) return false;
  return customerWaIdFromWhapiChatId(stored) !== null;
}

export function outboundWhapiChatId(input: {
  providerChatId: string | null | undefined;
  customerWaId: string;
}): string | null {
  const stored = input.providerChatId?.trim() ?? "";
  if (isWhapiGroupChatId(stored)) return null;
  if (isWhapiPhoneChatId(stored) || isWhapiLidChatId(stored)) return stored;
  if (isWhapiPhoneChatId(input.customerWaId)) return input.customerWaId.trim();
  if (isWhapiLidChatId(input.customerWaId)) return input.customerWaId.trim();
  return whapiPhoneChatIdFromDigits(input.customerWaId);
}
