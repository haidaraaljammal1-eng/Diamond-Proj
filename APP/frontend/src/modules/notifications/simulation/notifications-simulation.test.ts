import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { isUiDemoSimulationEnabled } from "../../demo-simulation/simulation.enabled.ts";
import { buildNotificationsFixture } from "./notifications-simulation.fixture.ts";
import { sendDesktopNotification, type DesktopNotificationApi } from "./desktop-notification.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("notification browser demo", () => {
  it("is explicitly gated and never enabled in production", () => {
    assert.equal(isUiDemoSimulationEnabled("notifications", "true", "development"), true);
    assert.equal(isUiDemoSimulationEnabled("notifications", "false", "development"), false);
    assert.equal(isUiDemoSimulationEnabled("notifications", "true", "production"), false);
  });

  it("provides the requested synthetic lifecycle coverage", () => {
    const fixture = buildNotificationsFixture(Date.parse("2026-09-19T12:00:00.000Z"));
    assert.equal(fixture.length, 10);
    assert.equal(fixture.filter((item) => !item.read).length, 4);
    assert.ok(fixture.some((item) => item.type === "CONTRACT_UNPAID"));
    assert.ok(fixture.some((item) => item.type === "VIOLATION_UNPAID"));
    assert.ok(fixture.some((item) => item.type === "VEHICLE_RETURN_OVERDUE"));
    assert.ok(fixture.some((item) => item.type === "CAR_OUT_PENDING"));
    assert.ok(fixture.some((item) => item.type === "VEHICLE_HANDED_OVER"));
    assert.ok(fixture.some((item) => item.type === "VEHICLE_RETURNED"));
    assert.ok(fixture.every((item) => item.id.startsWith("demo-notification-")));
  });

  it("keeps the demo store frontend-only and isolated", () => {
    const store = readFileSync(join(here, "notifications-simulation.store.ts"), "utf8");
    const hook = readFileSync(join(here, "use-notifications-simulation.ts"), "utf8");
    assert.match(store, /create<NotificationsSimulationState>/);
    assert.match(store, /isUiDemoSimulationEnabled\("notifications"\)/);
    assert.doesNotMatch(`${store}\n${hook}`, /apiRequest|fetch\(|axios|\bfetch\b/);
    assert.match(store, /markRead/);
    assert.match(store, /markAllRead/);
  });

  it("handles unsupported, denied, default, and granted browser permissions", async () => {
    const input = { title: "Diamond Rent Car", body: "Demo summary", tag: "demo" };
    assert.equal(await sendDesktopNotification(input), "unsupported");

    const denied: DesktopNotificationApi = {
      permission: "denied",
      requestPermission: async () => "denied",
      create: () => undefined,
    };
    assert.equal(await sendDesktopNotification(input, denied), "denied");

    let requested = false;
    let constructed = false;
    const granted: DesktopNotificationApi = {
      permission: "default",
      requestPermission: async () => {
        requested = true;
        return "granted";
      },
      create: () => {
        constructed = true;
      },
    };
    assert.equal(await sendDesktopNotification(input, granted), "sent");
    assert.equal(requested, true);
    assert.equal(constructed, true);
  });
});
