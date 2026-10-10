import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveGpsHealth,
  GPS_HEALTH_ONLINE_AFTER_SECONDS,
} from "src/modules/gps/gps-health";

const now = new Date("2026-10-09T20:00:00.000Z");

describe("deriveGpsHealth", () => {
  it("marks fresh communication online", () => {
    const result = deriveGpsHealth({
      capturedAt: new Date(now.getTime() - 30_000),
      now,
      offlineAfterMinutes: 10,
    });
    assert.deepEqual(result, { health: "ONLINE", ageSeconds: 30 });
  });

  it("keeps the online boundary inclusive", () => {
    const result = deriveGpsHealth({
      capturedAt: new Date(now.getTime() - GPS_HEALTH_ONLINE_AFTER_SECONDS * 1000),
      now,
      offlineAfterMinutes: 10,
    });
    assert.equal(result.health, "ONLINE");
  });

  it("marks communication stale between thresholds", () => {
    const result = deriveGpsHealth({
      capturedAt: new Date(now.getTime() - 5 * 60_000),
      now,
      offlineAfterMinutes: 10,
    });
    assert.deepEqual(result, { health: "STALE", ageSeconds: 300 });
  });

  it("marks communication offline at the configured cutoff", () => {
    const result = deriveGpsHealth({
      capturedAt: new Date(now.getTime() - 10 * 60_000 - 1_000),
      now,
      offlineAfterMinutes: 10,
    });
    assert.deepEqual(result, { health: "OFFLINE", ageSeconds: 601 });
  });

  it("treats missing latest state as offline without an age", () => {
    const result = deriveGpsHealth({
      capturedAt: null,
      now,
      offlineAfterMinutes: 10,
    });
    assert.deepEqual(result, { health: "OFFLINE", ageSeconds: null });
  });

  it("does not produce a negative age for a future timestamp", () => {
    const result = deriveGpsHealth({
      capturedAt: new Date(now.getTime() + 60_000),
      now,
      offlineAfterMinutes: 10,
    });
    assert.deepEqual(result, { health: "ONLINE", ageSeconds: 0 });
  });
});
