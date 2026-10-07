import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { resolveProviderRecipient } from "src/modules/whatsapp/whatsapp.recipient-addressing";

/** @deprecated Prefer resolveProviderRecipient with explicit capabilities. */
export function outboundProviderChatId(input: {
  providerChatId: string | null | undefined;
  customerWaId: string;
}): string | null {
  const caps = createWhatsAppProvider().capabilities();
  if (caps.recipientAddressing !== "PROVIDER_CHAT_ID") return null;
  return resolveProviderRecipient(caps, input)?.toAddress ?? null;
}
