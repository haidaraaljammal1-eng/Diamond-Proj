import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_LIVE_GPS_SYNC_CADENCE_MS,
  GPS_PROVIDER_SYNC_CADENCE_MS,
  providerSyncCadenceMs,
} from "src/modules/gps/gps-provider-sync.constants";
import { LIVE_GPS_PROVIDER_KEY } from "src/modules/gps/providers/live-gps/live-gps.constants";

describe("LIVE_GPS fast sync cadence", () => {
  it("uses ~5s cadence for LIVE_GPS and 60s for SEVEN_STARS", () => {
    assert.equal(
      providerSyncCadenceMs(LIVE_GPS_PROVIDER_KEY, DEFAULT_LIVE_GPS_SYNC_CADENCE_MS),
      5_000,
    );
    assert.equal(providerSyncCadenceMs("SEVEN_STARS"), GPS_PROVIDER_SYNC_CADENCE_MS);
  });

  it("general provider sync cycle excludes LIVE_GPS (fast timer owns it)", () => {
    const source = readFileSync(
      path.resolve("src/modules/gps/gps-provider-sync.service.ts"),
      "utf8",
    );
    assert.ok(source.includes("key !== LIVE_GPS_PROVIDER_KEY"));
    assert.ok(source.includes("runLiveGpsFastSyncCycle"));
  });

  it("prevents overlapping LIVE account sync via in-flight guard", () => {
    const source = readFileSync(
      path.resolve("src/modules/gps/gps-provider-sync.service.ts"),
      "utf8",
    );
    assert.ok(source.includes("inFlightAccounts"));
    assert.ok(source.includes('skipped: "in_flight"'));
  });

  it("dedicated scheduler timer for LIVE_GPS (separate from general pollMs)", () => {
    const source = readFileSync(path.resolve("src/plugins/scheduler.ts"), "utf8");
    assert.ok(source.includes("runLiveGpsFastSyncCycle"));
    assert.ok(source.includes("liveGpsRunning"));
    assert.ok(source.includes("setInterval(liveGpsTick, liveGpsCadenceMs)"));
    assert.ok(source.includes("setInterval(() => void tick(), pollMs)"));
  });
});
