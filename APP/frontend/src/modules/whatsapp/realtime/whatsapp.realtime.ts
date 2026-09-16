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

export type WhatsAppRealtimeTransportStatus = "idle" | "live" | "reconnecting" | "offline";

/** Notification envelope. Identifiers only — never message text or credentials. */
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

export function parseSseFrames(buffer: string): {
  events: WhatsAppRealtimeEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: WhatsAppRealtimeEvent[] = [];
  for (const block of parts) {
    const parsed = parseSseBlock(block);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}

function parseSseBlock(block: string): WhatsAppRealtimeEvent | null {
  let eventType: string | undefined;
  let eventId: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("id:")) eventId = line.slice(3).trim();
    else if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return null;
  }
  return validateRealtimeEvent(payload, eventId, eventType);
}

export function validateRealtimeEvent(
  payload: unknown,
  headerId?: string,
  headerType?: string,
): WhatsAppRealtimeEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : headerType;
  if (!type || !isWhatsAppRealtimeType(type)) return null;
  const eventId =
    typeof row.eventId === "string" && row.eventId.length > 0
      ? row.eventId
      : headerId && headerId.length > 0
        ? headerId
        : null;
  if (!eventId) return null;
  const occurredAt =
    typeof row.occurredAt === "string" && row.occurredAt.length > 0
      ? row.occurredAt
      : new Date(0).toISOString();
  return {
    eventId,
    type,
    conversationId: asOptionalId(row.conversationId),
    messageId: asOptionalId(row.messageId),
    connectionId: asOptionalId(row.connectionId),
    occurredAt,
    sendState: asSendState(row.sendState),
    providerStatus: asProviderStatus(row.providerStatus),
  };
}

function asOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asSendState(value: unknown): WhatsAppRealtimeSendState | undefined {
  if (value === "PENDING" || value === "ACCEPTED" || value === "FAILED" || value === "UNKNOWN") {
    return value;
  }
  return undefined;
}

function asProviderStatus(value: unknown): WhatsAppRealtimeProviderStatus | undefined {
  if (value === "SENT" || value === "DELIVERED" || value === "READ" || value === "FAILED") {
    return value;
  }
  return undefined;
}

export function nextRealtimeBackoffMs(attempt: number): number {
  const capped = Math.min(15_000, 1000 * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * 250);
  return capped + jitter;
}
