export interface WhatsAppRealtimeTraceMark {
  stage: "event" | "applied";
  eventType: string;
  at: number;
}

const MAX_MARKS = 50;
const marks: WhatsAppRealtimeTraceMark[] = [];

/** Stage timestamps only. Never message text, phone numbers, or credentials. */
export function traceWhatsAppRealtime(stage: WhatsAppRealtimeTraceMark["stage"], eventType: string): void {
  marks.push({ stage, eventType, at: Date.now() });
  if (marks.length > MAX_MARKS) marks.shift();
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(`whatsapp-realtime-${stage}`);
  }
}

export function readWhatsAppRealtimeTrace(): readonly WhatsAppRealtimeTraceMark[] {
  return marks;
}

export function resetWhatsAppRealtimeTraceForTests(): void {
  marks.length = 0;
}
