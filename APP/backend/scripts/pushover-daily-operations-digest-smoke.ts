/**
 * Live preview smoke for the unified Daily Operations & Receivables digest.
 *
 * - Loads a fresh snapshot from the real database (same queries as production).
 * - Builds the exact Pushover message body/title used by the scheduler.
 * - Sends ONE preview to the shared Pushover account so you can see the shape.
 * - Does NOT change DAILY_OPERATIONS_DIGEST_TIMES (09:00 / 14:00 / 19:00 stay).
 * - Does NOT claim production slot IdempotencyKeys (preview only).
 *
 * Usage:
 *   npx tsx scripts/pushover-daily-operations-digest-smoke.ts
 *   npx tsx scripts/pushover-daily-operations-digest-smoke.ts --dry-run
 */
import "./e2e-script-env";

process.env.SCHEDULER_ENABLED = "false";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const { buildApp } = await import("src/app");
  const { env } = await import("src/config/env");
  const { buildDailyOperationsDigestMessage } = await import(
    "src/modules/notification-delivery/business-notification.messages"
  );
  const { loadDailyOperationsDigestSnapshot } = await import(
    "src/modules/notification-delivery/daily-operations-digest.queries"
  );
  const {
    dailyOperationsDigestHasOutstanding,
    dailyOperationsDigestTotal,
  } = await import("src/modules/notification-delivery/daily-operations-digest.types");
  const { notificationService } = await import(
    "src/modules/notification-delivery/notification.service"
  );

  console.log("=== Daily Operations & Receivables — preview smoke ===");
  console.log("Schedule (unchanged):", env.DAILY_OPERATIONS_DIGEST_TIMES);
  console.log("Timezone:", env.ATTENTION_MONITOR_TIMEZONE);
  console.log("Digest enabled:", env.DAILY_OPERATIONS_DIGEST_ENABLED);
  console.log("Pushover enabled:", env.PUSHOVER_ENABLED);
  console.log("Mode:", dryRun ? "dry-run (print only)" : "live send (1 preview)");
  console.log("");

  const app = await buildApp();
  try {
    const now = new Date();
    const snapshot = await loadDailyOperationsDigestSnapshot(app.prisma, now);
    const total = dailyOperationsDigestTotal(snapshot);
    const payload = buildDailyOperationsDigestMessage(snapshot);

    console.log("--- Snapshot counts ---");
    console.log(JSON.stringify(snapshot, null, 2));
    console.log("Total Outstanding Items:", total);
    console.log("Has outstanding:", dailyOperationsDigestHasOutstanding(snapshot));
    console.log("");
    console.log("--- Pushover title ---");
    console.log(payload.title);
    console.log("");
    console.log("--- Pushover message (exact production shape) ---");
    console.log(payload.message);
    console.log("");

    if (!dailyOperationsDigestHasOutstanding(snapshot)) {
      console.log(
        "No outstanding items right now. Production would skip this slot; preview still shows the zeroed template above.",
      );
      if (dryRun || !env.PUSHOVER_ENABLED) {
        console.log("Nothing sent.");
        return;
      }
      console.log("Sending zeroed preview anyway so you can see the layout on the phone...");
    }

    if (dryRun) {
      console.log("Dry-run: skipped Pushover send.");
      return;
    }

    if (!env.PUSHOVER_ENABLED) {
      throw new Error("PUSHOVER_ENABLED=false — enable it in .env to send a live preview.");
    }

    // Preview banner so this is not confused with a real scheduled slot delivery.
    const previewPayload = {
      title: payload.title,
      message: ["[PREVIEW — not a scheduled slot]", "", payload.message].join("\n"),
    };

    const result = await notificationService.send(previewPayload);
    console.log("Pushover result:", result);
    if (!result.success) {
      throw new Error(`Pushover send failed: ${result.errorCode ?? "unknown"}`);
    }
    console.log("Preview sent to the shared Pushover account.");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
