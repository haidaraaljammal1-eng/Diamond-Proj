import fp from "fastify-plugin";
import { env } from "src/config/env";
import { runWhatsAppMediaCleanupCycle } from "src/modules/whatsapp/whatsapp.media-cleanup";

/**
 * Independent WhatsApp shared-media cleanup when the general scheduler is off.
 * One attempt on listen, then every 24 hours. Does not touch GPS or other cycles.
 */
export const whatsappMediaCleanupPlugin = fp(async (fastify) => {
  if (!env.WHATSAPP_MEDIA_CLEANUP_ENABLED) {
    fastify.log.info({ enabled: false }, "whatsapp-media cleanup: disabled");
    return;
  }
  if (env.SCHEDULER_ENABLED) {
    fastify.log.info("whatsapp-media cleanup: using background scheduler");
    return;
  }

  const intervalMs = env.WHATSAPP_MEDIA_CLEANUP_INTERVAL_MS;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const result = await runWhatsAppMediaCleanupCycle(fastify.prisma, fastify.log);
      if (!result.skipped && result.expired > 0) {
        fastify.log.info(result, "whatsapp-media: expired files removed");
      }
    } catch (err) {
      fastify.log.error({ err }, "whatsapp-media: cleanup failed");
    } finally {
      running = false;
    }
  }

  fastify.addHook("onListen", async () => {
    fastify.log.info({ intervalMs }, "whatsapp-media cleanup: started (independent)");
    timer = setInterval(() => void tick(), intervalMs);
    timer.unref?.();
    void tick();
  });

  fastify.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    fastify.log.info("whatsapp-media cleanup: stopped");
  });
});
