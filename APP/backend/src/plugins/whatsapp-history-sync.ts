import fp from "fastify-plugin";
import { createWhatsAppHistorySyncService } from "src/modules/whatsapp/whatsapp.history-sync.service";
import { reconcileWhatsAppHistorySyncOnBoot } from "src/modules/whatsapp/whatsapp.history-sync.lifecycle";

/**
 * Reconciles in-flight history import runs on listen. Does not call Whapi when
 * WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE=false (interrupted RUNNING → QUEUED only).
 */
export const whatsappHistorySyncPlugin = fp(async (fastify) => {
  fastify.addHook("onListen", async () => {
    const sync = createWhatsAppHistorySyncService(fastify);
    await reconcileWhatsAppHistorySyncOnBoot(fastify.prisma, fastify.log, (runId) =>
      sync.scheduleRun(runId),
    );
  });
});
