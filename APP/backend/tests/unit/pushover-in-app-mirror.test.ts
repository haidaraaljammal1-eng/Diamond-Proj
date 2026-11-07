import { test } from "node:test";
import assert from "node:assert/strict";
import { NotificationService } from "src/modules/notification-delivery/notification.service";
import {
  PUSHOVER_IN_APP_EVENT_KEY,
  PUSHOVER_IN_APP_TTL_MS,
  pushoverInAppCutoff,
  runPushoverInAppNotificationCleanup,
} from "src/modules/notification-delivery/pushover-in-app-mirror.service";

test("pushover in-app cutoff is 48 hours before now", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  assert.equal(
    pushoverInAppCutoff(now).toISOString(),
    new Date(now.getTime() - PUSHOVER_IN_APP_TTL_MS).toISOString(),
  );
});

test("NotificationService mirrors only after successful Pushover send", async () => {
  const mirrored: Array<{ title: string; body: string; dedupeKey?: string }> = [];
  const service = new NotificationService(() => ({
    name: "mock",
    configured: true,
    async send() {
      return { success: true, provider: "mock", requestId: "req-1" };
    },
  }));
  service.setInAppMirror(async (input) => {
    mirrored.push(input);
  });

  const ok = await service.send({
    title: "Diamond Rent Car",
    message: "Payment confirmed successfully.",
    inAppDedupeKey: "payment.confirmed:abc",
  });
  assert.equal(ok.success, true);
  assert.deepEqual(mirrored, [
    {
      title: "Diamond Rent Car",
      body: "Payment confirmed successfully.",
      dedupeKey: "payment.confirmed:abc",
      requestId: "req-1",
    },
  ]);

  mirrored.length = 0;
  const failing = new NotificationService(() => ({
    name: "mock",
    configured: true,
    async send() {
      return { success: false, provider: "mock", errorCode: "PROVIDER_REJECTED" };
    },
  }));
  failing.setInAppMirror(async (input) => {
    mirrored.push(input);
  });
  const failed = await failing.send({
    title: "t",
    message: "m",
    inAppDedupeKey: "should-not-mirror",
  });
  assert.equal(failed.success, false);
  assert.equal(mirrored.length, 0);
});

test("NotificationService still reports Pushover success when mirror throws", async () => {
  const service = new NotificationService(() => ({
    name: "mock",
    configured: true,
    async send() {
      return { success: true, provider: "mock", requestId: "req-2" };
    },
  }));
  service.setInAppMirror(async () => {
    throw new Error("mirror down");
  });
  const result = await service.send({ title: "t", message: "m" });
  assert.equal(result.success, true);
});

test("cleanup deletes only expired pushover.staff_alert rows", async () => {
  const deleted: unknown[] = [];
  const prisma = {
    notification: {
      deleteMany: async (args: unknown) => {
        deleted.push(args);
        return { count: 3 };
      },
    },
  } as never;

  const now = new Date("2026-11-07T12:00:00.000Z");
  const count = await runPushoverInAppNotificationCleanup(prisma, now);
  assert.equal(count, 3);
  assert.deepEqual(deleted[0], {
    where: {
      eventKey: PUSHOVER_IN_APP_EVENT_KEY,
      createdAt: { lt: pushoverInAppCutoff(now) },
    },
  });
});
