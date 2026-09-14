import type { PrismaClient } from "@prisma/client";
import {
  WHATSAPP_REALTIME_FANOUT_MS,
} from "src/modules/whatsapp/whatsapp.constants";
import {
  latestWhatsAppRealtimeId,
  listWhatsAppRealtimeSince,
  purgeExpiredWhatsAppRealtimeEvents,
} from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { getWhatsAppRealtimePublisher } from "src/modules/whatsapp/whatsapp.realtime-publisher";

/**
 * Shared-DB fan-out for API replicas. Each instance polls durable WhatsApp
 * outbox rows after its cursor and publishes to local SSE subscribers.
 * Duplicate ids are dropped by the in-process publisher.
 *
 * Starts on HTTP listen (not inject-only tests). Not a second generalized bus.
 */
export function startWhatsAppRealtimeFanout(
  prisma: PrismaClient,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): () => void {
  let cursor = 0;
  let running = false;
  let timer: NodeJS.Timeout | undefined;
  let ready = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      if (!ready) {
        cursor = await latestWhatsAppRealtimeId(prisma);
        ready = true;
      }
      const events = await listWhatsAppRealtimeSince(prisma, cursor, 100);
      if (events.length > 0) {
        const last = events[events.length - 1];
        if (last) cursor = Number(last.eventId);
        getWhatsAppRealtimePublisher().publishAll(events);
      }
      await purgeExpiredWhatsAppRealtimeEvents(prisma);
    } catch (err) {
      log?.error({ err }, "whatsapp realtime fanout failed");
    } finally {
      running = false;
    }
  }

  timer = setInterval(() => void tick(), WHATSAPP_REALTIME_FANOUT_MS);
  timer.unref?.();
  void tick();
  log?.info({ pollMs: WHATSAPP_REALTIME_FANOUT_MS }, "whatsapp realtime fanout started");

  return () => {
    if (timer) clearInterval(timer);
    log?.info({}, "whatsapp realtime fanout stopped");
  };
}
