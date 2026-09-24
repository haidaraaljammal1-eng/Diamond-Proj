/**
 * Pushover connectivity diagnostic (server-only, manual).
 *
 * Uses the production NotificationService / PushoverProvider path.
 * Never hardcodes or logs secrets. Not exposed through any API route.
 *
 * Run: npm run test:pushover
 */
import "dotenv/config";
import { notificationService } from "src/modules/notification-delivery/notification.service";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const result = await notificationService.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  console.log(`HTTP status: ${result.statusCode ?? "unknown"}`);
  console.log(`Pushover status: ${result.providerStatus ?? "unknown"}`);
  console.log(`Notification accepted: ${result.success ? "yes" : "no"}`);

  if (result.requestId) {
    console.log(`Pushover request id: ${result.requestId}`);
  }

  if (result.errorCode) {
    console.error(`Notification error code: ${result.errorCode}`);
  }

  if (!result.success) {
    if (result.errorCode === "DISABLED") {
      fail("Pushover test aborted: set PUSHOVER_ENABLED=true in APP/backend/.env");
    }
    if (result.errorCode === "NOT_CONFIGURED") {
      fail("Pushover test aborted: Pushover credentials are missing or incomplete");
    }
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Pushover test failed: ${message}`);
  process.exit(1);
});
