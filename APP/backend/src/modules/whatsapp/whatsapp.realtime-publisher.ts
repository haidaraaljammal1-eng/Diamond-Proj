import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { WHATSAPP_REALTIME_MAX_SUBSCRIBERS } from "src/modules/whatsapp/whatsapp.constants";

export type WhatsAppRealtimeListener = (event: WhatsAppRealtimeEvent) => void;

/**
 * In-process fan-out to SSE subscribers on THIS instance.
 * Cross-instance delivery uses the durable DomainOutboxEvent log + poller.
 * Documented: REST reconciliation remains the recovery path.
 */
export class WhatsAppRealtimePublisher {
  private readonly listeners = new Map<string, WhatsAppRealtimeListener>();
  private readonly seen = new Map<string, number>();
  private seq = 0;

  get subscriberCount(): number {
    return this.listeners.size;
  }

  get atCapacity(): boolean {
    return this.listeners.size >= WHATSAPP_REALTIME_MAX_SUBSCRIBERS;
  }

  subscribe(listener: WhatsAppRealtimeListener): () => void {
    const id = `sub-${++this.seq}`;
    this.listeners.set(id, listener);
    return () => {
      this.listeners.delete(id);
    };
  }

  publish(event: WhatsAppRealtimeEvent): boolean {
    if (this.wasSeen(event.eventId)) return false;
    for (const listener of this.listeners.values()) {
      try {
        listener(event);
      } catch {
        // Subscriber errors must not break other listeners or producers.
      }
    }
    return true;
  }

  publishAll(events: WhatsAppRealtimeEvent[]): void {
    for (const event of events) this.publish(event);
  }

  resetForTests(): void {
    this.listeners.clear();
    this.seen.clear();
    this.seq = 0;
  }

  private wasSeen(eventId: string): boolean {
    const now = Date.now();
    if (this.seen.has(eventId)) return true;
    this.seen.set(eventId, now);
    if (this.seen.size > 2_000) {
      for (const [id, at] of this.seen) {
        if (now - at > 10 * 60_000) this.seen.delete(id);
      }
    }
    return false;
  }
}

const hub = new WhatsAppRealtimePublisher();

export function getWhatsAppRealtimePublisher(): WhatsAppRealtimePublisher {
  return hub;
}

export function publishWhatsAppRealtime(events: WhatsAppRealtimeEvent[]): void {
  hub.publishAll(events);
}
