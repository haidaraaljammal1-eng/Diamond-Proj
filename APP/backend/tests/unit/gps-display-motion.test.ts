import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveDisplayMotionStatus,
  deriveTrackingStatus,
  tallyDisplayMotionStatuses,
} from "src/modules/gps/gps.mapper";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const FRESH = new Date("2026-09-10T11:55:00.000Z");
const STALE = new Date("2026-09-10T11:40:00.000Z");
const THRESHOLD = 3;
const MOTION_STALE_MIN = 15;
const CONNECTIVITY_OFFLINE_MIN = 10;
const binding = { id: "b1", isActive: true };

function motionInput(
  overrides: Partial<{
    latest: {
      capturedAt: Date;
      motionState: "UNKNOWN" | "MOVING" | "PARKED";
      speedKph: number | null;
      ignitionOn: boolean | null;
    } | null;
    binding: { id: string; isActive: boolean } | null;
    providerConfigured: boolean;
  }> = {},
) {
  return {
    providerConfigured: true,
    binding,
    latest: {
      capturedAt: FRESH,
      motionState: "PARKED" as const,
      speedKph: 0,
      ignitionOn: false,
    },
    now: NOW,
    motionStaleAfterMinutes: MOTION_STALE_MIN,
    movingThresholdKph: THRESHOLD,
    ...overrides,
  };
}

describe("deriveDisplayMotionStatus", () => {
  it("fresh + speed above threshold → MOVING", () => {
    assert.equal(
      deriveDisplayMotionStatus(
        motionInput({ latest: { capturedAt: FRESH, motionState: "PARKED", speedKph: 12, ignitionOn: false } }),
      ),
      "moving",
    );
  });

  it("fresh + not moving + ignitionOn=true → IDLE", () => {
    assert.equal(
      deriveDisplayMotionStatus(
        motionInput({ latest: { capturedAt: FRESH, motionState: "PARKED", speedKph: 0, ignitionOn: true } }),
      ),
      "idle",
    );
  });

  it("fresh + not moving + ignitionOn=false → PARKED", () => {
    assert.equal(
      deriveDisplayMotionStatus(
        motionInput({ latest: { capturedAt: FRESH, motionState: "PARKED", speedKph: 0, ignitionOn: false } }),
      ),
      "parked",
    );
  });

  it("stale/offline capture → display PARKED", () => {
    assert.equal(
      deriveDisplayMotionStatus(
        motionInput({
          latest: { capturedAt: STALE, motionState: "MOVING", speedKph: 40, ignitionOn: true },
        }),
      ),
      "parked",
    );
  });

  it("ignition unknown + not moving → PARKED", () => {
    assert.equal(
      deriveDisplayMotionStatus(
        motionInput({ latest: { capturedAt: FRESH, motionState: "UNKNOWN", speedKph: 0, ignitionOn: null } }),
      ),
      "parked",
    );
  });

  it("no latest state → summary PARKED", () => {
    assert.equal(deriveDisplayMotionStatus(motionInput({ latest: null })), "parked");
  });

  it("fresh moving within 2 min motion window → MOVING", () => {
    const t0 = new Date("2026-09-10T12:00:00.000Z");
    const now = new Date(t0.getTime() + 119_000);
    assert.equal(
      deriveDisplayMotionStatus({
        ...motionInput({
          latest: {
            capturedAt: t0,
            motionState: "MOVING",
            speedKph: 19,
            ignitionOn: true,
          },
        }),
        now,
        motionStaleAfterMinutes: 2,
      }),
      "moving",
    );
  });

  it("moving snapshot older than 2 min → PARKED", () => {
    const t0 = new Date("2026-09-10T12:00:00.000Z");
    const now = new Date(t0.getTime() + 121_000);
    assert.equal(
      deriveDisplayMotionStatus({
        ...motionInput({
          latest: {
            capturedAt: t0,
            motionState: "MOVING",
            speedKph: 19,
            ignitionOn: true,
          },
        }),
        now,
        motionStaleAfterMinutes: 2,
      }),
      "parked",
    );
  });

  it("fresh idle within 2 min → IDLE", () => {
    const t0 = new Date("2026-09-10T12:00:00.000Z");
    const now = new Date(t0.getTime() + 60_000);
    assert.equal(
      deriveDisplayMotionStatus({
        ...motionInput({
          latest: {
            capturedAt: t0,
            motionState: "PARKED",
            speedKph: 0,
            ignitionOn: true,
          },
        }),
        now,
        motionStaleAfterMinutes: 2,
      }),
      "idle",
    );
  });

  it("idle snapshot older than 2 min → PARKED", () => {
    const t0 = new Date("2026-09-10T12:00:00.000Z");
    const now = new Date(t0.getTime() + 180_000);
    assert.equal(
      deriveDisplayMotionStatus({
        ...motionInput({
          latest: {
            capturedAt: t0,
            motionState: "PARKED",
            speedKph: 0,
            ignitionOn: true,
          },
        }),
        now,
        motionStaleAfterMinutes: 2,
      }),
      "parked",
    );
  });

  it("at 3 min display parked while connectivity not offline yet", () => {
    const t0 = new Date("2026-09-10T12:00:00.000Z");
    const now = new Date(t0.getTime() + 180_000);
    const latest = {
      capturedAt: t0,
      motionState: "MOVING" as const,
      speedKph: 19,
      ignitionOn: true,
    };
    assert.equal(
      deriveDisplayMotionStatus({
        providerConfigured: true,
        binding,
        latest,
        now,
        motionStaleAfterMinutes: 2,
        movingThresholdKph: THRESHOLD,
      }),
      "parked",
    );
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding,
        latest: { capturedAt: t0, motionState: "MOVING" },
        now,
        offlineAfterMinutes: CONNECTIVITY_OFFLINE_MIN,
      }),
      "moving",
    );
  });

  it("tally satisfies moving + idle + parked = fleet size", () => {
    const fleet = [
      deriveDisplayMotionStatus(
        motionInput({ latest: { capturedAt: FRESH, motionState: "MOVING", speedKph: 10, ignitionOn: true } }),
      ),
      deriveDisplayMotionStatus(
        motionInput({ latest: { capturedAt: FRESH, motionState: "PARKED", speedKph: 0, ignitionOn: true } }),
      ),
      deriveDisplayMotionStatus(motionInput({ latest: null })),
      deriveDisplayMotionStatus(
        motionInput({
          latest: { capturedAt: STALE, motionState: "MOVING", speedKph: 20, ignitionOn: true },
        }),
      ),
    ];
    const tallies = tallyDisplayMotionStatuses(fleet);
    assert.equal(tallies.moving + tallies.idle + tallies.parked, fleet.length);
    assert.equal(tallies.moving, 1);
    assert.equal(tallies.idle, 1);
    assert.equal(tallies.parked, 2);
  });
});
