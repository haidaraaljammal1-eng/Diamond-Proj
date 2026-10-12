import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveDisplayMotionStatus,
  displayMotionIdleLatestWhere,
  displayMotionMovingLatestWhere,
  displayMotionParkedVehicleWhere,
  trackingStatusWhere,
} from "src/modules/gps/gps.mapper";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const MOTION_CUTOFF = new Date("2026-09-10T11:50:00.000Z");
const CONNECTIVITY_CUTOFF = new Date("2026-09-10T11:45:00.000Z");
const FRESH = new Date("2026-09-10T11:55:00.000Z");
const STALE = new Date("2026-09-10T11:40:00.000Z");
const THRESHOLD = 3;
const binding = { id: "b1", isActive: true };

function motionFromLatest(
  latest: {
    capturedAt: Date;
    motionState: "UNKNOWN" | "MOVING" | "PARKED";
    speedKph: number | null;
    ignitionOn: boolean | null;
  } | null,
) {
  return deriveDisplayMotionStatus({
    providerConfigured: true,
    binding,
    latest,
    now: NOW,
    motionStaleAfterMinutes: 15,
    movingThresholdKph: THRESHOLD,
  });
}

describe("display motion list filters", () => {
  it("moving where matches display moving semantics", () => {
    const clause = trackingStatusWhere(
      "moving",
      true,
      CONNECTIVITY_CUTOFF,
      MOTION_CUTOFF,
      THRESHOLD,
    );
    assert.deepEqual(clause, {
      gpsLatestState: displayMotionMovingLatestWhere(MOTION_CUTOFF, THRESHOLD),
    });
    assert.equal(
      motionFromLatest({
        capturedAt: FRESH,
        motionState: "PARKED",
        speedKph: 12,
        ignitionOn: false,
      }),
      "moving",
    );
  });

  it("idle where matches fresh + ignition on + not moving", () => {
    const clause = trackingStatusWhere(
      "idle",
      true,
      CONNECTIVITY_CUTOFF,
      MOTION_CUTOFF,
      THRESHOLD,
    );
    assert.deepEqual(clause, {
      gpsLatestState: displayMotionIdleLatestWhere(MOTION_CUTOFF, THRESHOLD),
    });
    assert.equal(
      motionFromLatest({
        capturedAt: FRESH,
        motionState: "PARKED",
        speedKph: 0,
        ignitionOn: true,
      }),
      "idle",
    );
    assert.equal(
      motionFromLatest({
        capturedAt: STALE,
        motionState: "PARKED",
        speedKph: 0,
        ignitionOn: true,
      }),
      "parked",
    );
  });

  it("parked where is complement of display moving and idle", () => {
    const parkedClause = trackingStatusWhere(
      "parked",
      true,
      CONNECTIVITY_CUTOFF,
      MOTION_CUTOFF,
      THRESHOLD,
    );
    assert.deepEqual(
      parkedClause,
      displayMotionParkedVehicleWhere(MOTION_CUTOFF, THRESHOLD),
    );
    assert.equal(motionFromLatest(null), "parked");
    assert.equal(
      motionFromLatest({
        capturedAt: STALE,
        motionState: "MOVING",
        speedKph: 40,
        ignitionOn: true,
      }),
      "parked",
    );
    assert.equal(
      motionFromLatest({
        capturedAt: FRESH,
        motionState: "UNKNOWN",
        speedKph: 0,
        ignitionOn: null,
      }),
      "parked",
    );
    assert.notEqual(
      motionFromLatest({
        capturedAt: FRESH,
        motionState: "MOVING",
        speedKph: 10,
        ignitionOn: true,
      }),
      "parked",
    );
  });

  it("preserves provider binding when composed with display motion filters", () => {
    for (const status of ["moving", "idle", "parked"] as const) {
      const where = {
        isActive: true,
        gpsBinding: {
          isActive: true,
          providerAccount: { providerKey: "SEVEN_STARS" as const },
        },
        ...trackingStatusWhere(
          status,
          true,
          CONNECTIVITY_CUTOFF,
          MOTION_CUTOFF,
          THRESHOLD,
        ),
      };
      const bindingClause = where.gpsBinding;
      assert.ok(bindingClause && typeof bindingClause === "object");
      assert.equal(bindingClause.providerAccount?.providerKey, "SEVEN_STARS");
    }
  });
});
