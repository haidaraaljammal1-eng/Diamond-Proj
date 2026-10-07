import { outboundUltraMsgChatId } from "src/modules/whatsapp/ultramsg.chat-id";
import { outboundWhapiChatId } from "src/modules/whatsapp/whapi.chat-id";
import type { WhatsAppProviderCapabilities } from "src/modules/whatsapp/whatsapp.capabilities";

export type WhatsAppRecipientAddressingMode = "WA_ID" | "PROVIDER_CHAT_ID";

export interface ResolveProviderRecipientInput {
  customerWaId: string;
  providerChatId?: string | null;
}

export interface ResolvedProviderRecipient {
  /** Value passed to provider send APIs (`toWaId` / `toChatId`). */
  toAddress: string;
  addressing: WhatsAppRecipientAddressingMode;
}

/**
 * Provider-neutral outbound recipient resolution (text + media).
 * Not related to media transport (upload vs direct bytes).
 */
export function resolveProviderRecipient(
  capabilities: WhatsAppProviderCapabilities,
  input: ResolveProviderRecipientInput,
): ResolvedProviderRecipient | null {
  if (capabilities.recipientAddressing === "PROVIDER_CHAT_ID") {
    const chatInput = {
      providerChatId: input.providerChatId ?? null,
      customerWaId: input.customerWaId,
    };
    const chatId =
      capabilities.provider === "WHAPI"
        ? outboundWhapiChatId(chatInput)
        : capabilities.provider === "ULTRAMSG"
          ? outboundUltraMsgChatId(chatInput)
          : null;
    if (!chatId) return null;
    return { toAddress: chatId, addressing: "PROVIDER_CHAT_ID" };
  }
  const waId = input.customerWaId.trim();
  if (!waId) return null;
  return { toAddress: waId, addressing: "WA_ID" };
}
