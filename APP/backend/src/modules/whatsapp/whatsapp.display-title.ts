import {
  customerWaIdFromWhapiChatId,
  isWhapiLidChatId,
  isWhapiPhoneChatId,
} from "src/modules/whatsapp/whapi.chat-id";
import { nextCustomerDisplayName } from "src/modules/whatsapp/whatsapp.message-type";

export function resolveConversationDisplayTitle(input: {
  linkedCustomerName: string | null;
  customerDisplayName: string | null;
  customerWaId: string;
  providerChatId: string | null;
}): string {
  const linked = input.linkedCustomerName?.trim();
  if (linked) return linked;
  const stored = input.customerDisplayName?.trim();
  if (stored) return stored;
  const chatId = input.providerChatId?.trim() || input.customerWaId;
  if (isWhapiLidChatId(chatId)) return chatId;
  const digits = customerWaIdFromWhapiChatId(chatId);
  if (digits && isWhapiPhoneChatId(chatId)) return digits;
  return input.customerWaId;
}

/** Apply Whapi contact name without overriding linked customers or stronger labels. */
export function mergeWhapiContactDisplayName(
  current: string | null,
  whapiName: string | null,
  customerWaId: string,
  hasLinkedCustomer: boolean,
): string | null {
  if (hasLinkedCustomer) return current ?? null;
  const next = typeof whapiName === "string" ? whapiName.trim() : "";
  if (!next) return current ?? null;
  const cur = current?.trim() ?? "";
  if (!cur) return next;
  if (cur === customerWaId || /^\d{6,}$/.test(cur)) {
    return next;
  }
  return nextCustomerDisplayName(current, whapiName);
}
