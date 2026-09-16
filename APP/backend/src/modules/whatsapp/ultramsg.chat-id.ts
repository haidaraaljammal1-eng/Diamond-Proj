const CONTACT_SUFFIX = "@c.us";
const GROUP_SUFFIX = "@g.us";

export function isUltraMsgGroupChatId(chatId: string | null | undefined): boolean {
  return typeof chatId === "string" && chatId.trim().toLowerCase().endsWith(GROUP_SUFFIX);
}

export function isUltraMsgContactChatId(chatId: string | null | undefined): boolean {
  return typeof chatId === "string" && chatId.trim().toLowerCase().endsWith(CONTACT_SUFFIX);
}

/** Exact documented transform: strip only the terminal `@c.us` suffix. Nothing else. */
export function digitsFromUltraMsgContactChatId(chatId: string): string | null {
  const trimmed = chatId.trim();
  if (!trimmed.toLowerCase().endsWith(CONTACT_SUFFIX)) return null;
  const digits = trimmed.slice(0, -CONTACT_SUFFIX.length);
  return digits.length > 0 ? digits : null;
}

export function ultraMsgContactChatIdFromDigits(digits: string): string | null {
  const value = digits.trim();
  if (!/^\d+$/.test(value)) return null;
  return `${value}${CONTACT_SUFFIX}`;
}

export function outboundUltraMsgChatId(input: {
  providerChatId: string | null | undefined;
  customerWaId: string;
}): string | null {
  const stored = input.providerChatId?.trim() ?? "";
  if (isUltraMsgGroupChatId(stored)) return null;
  if (isUltraMsgContactChatId(stored)) return stored;
  if (isUltraMsgContactChatId(input.customerWaId)) return input.customerWaId.trim();
  return ultraMsgContactChatIdFromDigits(input.customerWaId);
}
