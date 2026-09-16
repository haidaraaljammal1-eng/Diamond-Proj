export const WHATSAPP_REALTIME_TYPES = [
  "whatsapp.conversation.created",
  "whatsapp.conversation.updated",
  "whatsapp.conversation.read",
  "whatsapp.message.received",
  "whatsapp.message.outbound_created",
  "whatsapp.message.send_state_changed",
  "whatsapp.message.provider_status_changed",
  "whatsapp.connection.updated",
] as const;

export type WhatsAppRealtimeType = (typeof WHATSAPP_REALTIME_TYPES)[number];

export type WhatsAppRealtimeSendState = "PENDING" | "ACCEPTED" | "FAILED" | "UNKNOWN";
export type WhatsAppRealtimeProviderStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";

/**
 * Minimal SSE envelope. Identifiers only — never message text, tokens, or webhook JSON.
 */
export interface WhatsAppRealtimeEvent {
  eventId: string;
  type: WhatsAppRealtimeType;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  occurredAt: string;
  sendState?: WhatsAppRealtimeSendState;
  providerStatus?: WhatsAppRealtimeProviderStatus;
}

const TYPE_SET = new Set<string>(WHATSAPP_REALTIME_TYPES);

export function isWhatsAppRealtimeType(value: string): value is WhatsAppRealtimeType {
  return TYPE_SET.has(value);
}

export function formatSseFrame(event: WhatsAppRealtimeEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
