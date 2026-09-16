import type { WhatsAppConversationListItemDto } from "../types/whatsapp.types.ts";
import type { WhatsAppSimulationInbox } from "./whatsapp-simulation.fixture.ts";

export function selectWhatsAppPresentation<T>(
  real: T,
  simulationActive: boolean,
  simulated: T,
): T {
  if (simulationActive) return simulated;
  return real;
}

export function filterSimulatedConversations(
  inbox: WhatsAppSimulationInbox,
  search: string,
  unreadOnly: boolean,
): WhatsAppConversationListItemDto[] {
  const term = search.trim().toLowerCase();
  return inbox.conversations.filter((item) => {
    if (unreadOnly && item.unreadCount <= 0) return false;
    if (!term) return true;
    const haystack = [
      item.customerWaId,
      item.customerDisplayName ?? "",
      item.lastMessagePreview ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}
