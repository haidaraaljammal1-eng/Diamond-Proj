import { outboundWhapiChatId } from "src/modules/whatsapp/whapi.chat-id";
import { resolveConversationDisplayTitle } from "src/modules/whatsapp/whatsapp.display-title";
import type { WhatsAppConversationListItemDto } from "src/modules/whatsapp/whatsapp.schema";

export type ConversationPresentationRow = {
  id: string;
  connectionId: string;
  kind?: "DIRECT" | "GROUP";
  customerWaId: string;
  providerChatId: string | null;
  customerDisplayName: string | null;
  lastMessagePreview: string | null;
  lastMessageType: WhatsAppConversationListItemDto["lastMessageType"];
  lastMessageAt: Date | null;
  unreadCount: number;
  lastInboundAt: Date | null;
  customerId?: number | null;
  customer?: { name: string } | null;
  connection: { displayPhoneNumber: string | null; verifiedName: string | null };
};

export function providerContactIdForConversation(row: ConversationPresentationRow): string | null {
  const stored = row.providerChatId?.trim() ?? "";
  if (stored) return stored;
  return outboundWhapiChatId({
    providerChatId: row.providerChatId,
    customerWaId: row.customerWaId,
  });
}

export function toConversationPresentation(
  row: ConversationPresentationRow,
  avatarByContactId: ReadonlyMap<string, boolean>,
): Pick<WhatsAppConversationListItemDto, "displayTitle" | "hasAvatar"> {
  const contactId = providerContactIdForConversation(row);
  const displayTitle = resolveConversationDisplayTitle({
    linkedCustomerName: row.customer?.name ?? null,
    customerDisplayName: row.customerDisplayName,
    customerWaId: row.customerWaId,
    providerChatId: row.providerChatId,
  });
  const hasAvatar = contactId ? avatarByContactId.get(contactId) === true : false;
  return { displayTitle, hasAvatar };
}
