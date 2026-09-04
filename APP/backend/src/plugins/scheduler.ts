import fp from "fastify-plugin";
import { env } from "src/config/env";
import { createBackgroundRunner } from "src/worker/background-runner";

/**
 * In-process background scheduler — the production driver for the automatic
 * flow in a single-service (Docker) deployment. It runs the same background
 * cycles the standalone worker runs (call-center automation, complaint SLAs,
 * scheduled reports) on a fixed interval INSIDE the API process.
 * One container, one service, no external process manager, no separate worker.
 *
 * WHY THIS IS SAFE
 *   Every cycle is idempotent (advisory locks + status CAS + unique constraints),
 *   so even with N API replicas overlapping runs never duplicate a send. An
 *   overlap guard also prevents a slow cycle from stacking on itself within one
 *   process. If you later scale the background work onto a DEDICATED worker
 *   container, set SCHEDULER_ENABLED=false on the API replicas and run
 *   run the background runner there instead.
 *
 * WHY onListen (not onReady)
 *   The loop starts only once the HTTP server is actually listening. Integration
 *   tests build the app and use `.inject()` WITHOUT listening, so the scheduler
 *   never starts under test — no leaked interval handle, no double-processing of
 *   fixtures — while tests still drive the cycles explicitly when they need to.
 */
export const schedulerPlugin = fp(async (fastify) => {
  if (!env.SCHEDULER_ENABLED) {
    fastify.log.info({ enabled: false }, "background scheduler: disabled (SCHEDULER_ENABLED=false)");
    return;
  }

  const pollMs = env.SCHEDULER_POLL_MS;
  let running = false; // overlap guard: skip a tick while the previous is still in flight
  let timer: NodeJS.Timeout | undefined;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await runner.runAllCycles();
    } finally {
      running = false;
    }
  }

  // Built lazily so every decorator the cycles need (prisma, mailer, settings,
  // notifications, …) is present. onListen fires after the full plugin tree and
  // app.ready(), so all are available here.
  let runner: ReturnType<typeof createBackgroundRunner>;

  fastify.addHook("onListen", async () => {
    runner = createBackgroundRunner(fastify);
    fastify.log.info({ pollMs }, "background scheduler: started (in-process)");
    timer = setInterval(() => void tick(), pollMs);
    // Don't let the poll timer alone keep the process alive; the listening
    // socket already does, and this lets shutdown proceed cleanly.
    timer.unref?.();
    // Kick once right away so a job that is already due isn't held for a full
    // interval after boot.
    void tick();
  });

  fastify.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    fastify.log.info("background scheduler: stopped");
  });
});
