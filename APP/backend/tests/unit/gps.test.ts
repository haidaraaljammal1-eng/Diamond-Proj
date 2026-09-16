import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countsInSummaryOnlineTotal,
  deriveMotionState,
  deriveTrackingStatus,
  shouldApplyIncomingPosition,
  tallyGpsSummaryStatuses,
  validateNormalizedPosition,
} from "src/modules/gps/gps.mapper";
import { GpsErrorReason } from "src/modules/gps/gps.errors";
import { GpsUnconfiguredProvider } from "src/modules/gps/providers/gps-unconfigured.provider";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const FRESH = new Date("2026-09-10T11:55:00.000Z");
const STALE = new Date("2026-09-10T11:40:00.000Z");

describe("GpsUnconfiguredProvider", () => {
  it("is not configured and does not invent network behaviour", () => {
    const provider = new GpsUnconfiguredProvider();
    assert.equal(provider.configured, false);
    assert.equal(provider.name, "none");
  });
});

describe("deriveMotionState", () => {
  it("derives MOVING when speed is above the threshold", () => {
    assert.equal(deriveMotionState(12, 3), "MOVING");
  });

  it("derives PARKED when speed is at or below the threshold", () => {
    assert.equal(deriveMotionState(3, 3), "PARKED");
    assert.equal(deriveMotionState(0, 3), "PARKED");
  });

  it("derives UNKNOWN when speed is missing", () => {
    assert.equal(deriveMotionState(null, 3), "UNKNOWN");
  });
});

describe("deriveTrackingStatus", () => {
  const binding = { id: "b1", isActive: true };

  it("returns not_configured when the provider is off", () => {
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: false,
        binding,
        latest: { capturedAt: FRESH, motionState: "MOVING" },
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "not_configured",
    );
  });

  it("returns unassigned when there is no active binding", () => {
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding: null,
        latest: null,
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "unassigned",
    );
  });

  it("returns no_data when a binding has no location", () => {
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding,
        latest: null,
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "no_data",
    );
  });

  it("returns offline when the latest location is stale", () => {
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding,
        latest: { capturedAt: STALE, motionState: "MOVING" },
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "offline",
    );
  });

  it("returns moving / parked / online from a fresh location", () => {
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding,
        latest: { capturedAt: FRESH, motionState: "MOVING" },
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "moving",
    );
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding,
        latest: { capturedAt: FRESH, motionState: "PARKED" },
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "parked",
    );
    assert.equal(
      deriveTrackingStatus({
        providerConfigured: true,
        binding,
        latest: { capturedAt: FRESH, motionState: "UNKNOWN" },
        now: NOW,
        offlineAfterMinutes: 10,
      }),
      "online",
    );
  });
});

describe("GPS summary online total", () => {
  const binding = { id: "b1", isActive: true };

  it("counts a fresh MOVING vehicle in summary online", () => {
    const row = deriveTrackingStatus({
      providerConfigured: true,
      binding,
      latest: { capturedAt: FRESH, motionState: "MOVING" },
      now: NOW,
      offlineAfterMinutes: 10,
    });
    assert.equal(row, "moving");
    assert.equal(countsInSummaryOnlineTotal(row), true);
    const tallies = tallyGpsSummaryStatuses([row]);
    assert.equal(tallies.moving, 1);
    assert.equal(tallies.online, 1);
  });

  it("counts a fresh PARKED vehicle in summary online", () => {
    const row = deriveTrackingStatus({
      providerConfigured: true,
      binding,
      latest: { capturedAt: FRESH, motionState: "PARKED" },
      now: NOW,
      offlineAfterMinutes: 10,
    });
    assert.equal(row, "parked");
    assert.equal(countsInSummaryOnlineTotal(row), true);
    const tallies = tallyGpsSummaryStatuses([row]);
    assert.equal(tallies.parked, 1);
    assert.equal(tallies.online, 1);
  });

  it("counts a fresh ONLINE / unknown-motion vehicle in summary online", () => {
    const row = deriveTrackingStatus({
      providerConfigured: true,
      binding,
      latest: { capturedAt: FRESH, motionState: "UNKNOWN" },
      now: NOW,
      offlineAfterMinutes: 10,
    });
    assert.equal(row, "online");
    assert.equal(countsInSummaryOnlineTotal(row), true);
    const tallies = tallyGpsSummaryStatuses([row]);
    assert.equal(tallies.online, 1);
    assert.equal(tallies.moving, 0);
    assert.equal(tallies.parked, 0);
  });

  it("does not count OFFLINE as summary online", () => {
    const row = deriveTrackingStatus({
      providerConfigured: true,
      binding,
      latest: { capturedAt: STALE, motionState: "MOVING" },
      now: NOW,
      offlineAfterMinutes: 10,
    });
    assert.equal(row, "offline");
    assert.equal(countsInSummaryOnlineTotal(row), false);
    const tallies = tallyGpsSummaryStatuses([row]);
    assert.equal(tallies.offline, 1);
    assert.equal(tallies.online, 0);
  });

  it("does not count NO_DATA as summary online", () => {
    const row = deriveTrackingStatus({
      providerConfigured: true,
      binding,
      latest: null,
      now: NOW,
      offlineAfterMinutes: 10,
    });
    assert.equal(row, "no_data");
    assert.equal(countsInSummaryOnlineTotal(row), false);
    const tallies = tallyGpsSummaryStatuses([row]);
    assert.equal(tallies.noData, 1);
    assert.equal(tallies.online, 0);
  });

  it("does not count UNASSIGNED as summary online", () => {
    const row = deriveTrackingStatus({
      providerConfigured: true,
      binding: { id: "b1", isActive: false },
      latest: { capturedAt: FRESH, motionState: "MOVING" },
      now: NOW,
      offlineAfterMinutes: 10,
    });
    assert.equal(row, "unassigned");
    assert.equal(countsInSummaryOnlineTotal(row), false);
    const tallies = tallyGpsSummaryStatuses([row]);
    assert.equal(tallies.online, 0);
  });

  it("keeps row-level trackingStatus values unchanged while summing fresh locations", () => {
    const statuses = [
      "moving",
      "parked",
      "online",
      "offline",
      "no_data",
      "unassigned",
      "not_configured",
    ] as const;
    const tallies = tallyGpsSummaryStatuses(statuses);
    assert.equal(tallies.moving, 1);
    assert.equal(tallies.parked, 1);
    assert.equal(tallies.offline, 1);
    assert.equal(tallies.noData, 1);
    assert.equal(tallies.online, 3);
    assert.equal(countsInSummaryOnlineTotal("not_configured"), false);
  });
});

describe("validateNormalizedPosition", () => {
  const base = {
    vehicleId: 1,
    capturedAt: NOW,
    latitude: 25.2048,
    longitude: 55.2708,
  };

  it("accepts valid coordinates and leaves optional speed/heading empty", () => {
    const result = validateNormalizedPosition(base, NOW);
    assert.equal(result.latitude, 25.2048);
    assert.equal(result.speedKph, null);
    assert.equal(result.headingDegrees, null);
  });

  it("rejects out-of-range coordinates without putting the values in the reason", () => {
    try {
      validateNormalizedPosition({ ...base, latitude: 95 }, NOW);
      assert.fail("expected throw");
    } catch (error) {
      assert.equal(
        (error as { context?: { reason?: string } }).context?.reason,
        GpsErrorReason.INVALID_COORDINATES,
      );
      assert.equal(JSON.stringify(error).includes("95"), false);
    }
  });

  it("rejects negative speed and heading of 360", () => {
    try {
      validateNormalizedPosition({ ...base, speedKph: -1 }, NOW);
      assert.fail("expected throw");
    } catch (error) {
      assert.equal(
        (error as { context?: { reason?: string } }).context?.reason,
        GpsErrorReason.INVALID_SPEED,
      );
    }
    try {
      validateNormalizedPosition({ ...base, headingDegrees: 360 }, NOW);
      assert.fail("expected throw");
    } catch (error) {
      assert.equal(
        (error as { context?: { reason?: string } }).context?.reason,
        GpsErrorReason.INVALID_HEADING,
      );
    }
  });
});

describe("shouldApplyIncomingPosition", () => {
  it("applies the first position and a newer capturedAt", () => {
    assert.equal(
      shouldApplyIncomingPosition({
        existingCapturedAt: null,
        existingSourceEventId: null,
        incomingCapturedAt: NOW,
        incomingSourceEventId: null,
      }),
      "apply",
    );
    assert.equal(
      shouldApplyIncomingPosition({
        existingCapturedAt: STALE,
        existingSourceEventId: "a",
        incomingCapturedAt: FRESH,
        incomingSourceEventId: "b",
      }),
      "apply",
    );
  });

  it("ignores an older out-of-order position", () => {
    assert.equal(
      shouldApplyIncomingPosition({
        existingCapturedAt: FRESH,
        existingSourceEventId: "a",
        incomingCapturedAt: STALE,
        incomingSourceEventId: "b",
      }),
      "stale",
    );
  });

  it("treats the same sourceEventId as idempotent", () => {
    assert.equal(
      shouldApplyIncomingPosition({
        existingCapturedAt: STALE,
        existingSourceEventId: "evt-1",
        incomingCapturedAt: FRESH,
        incomingSourceEventId: "evt-1",
      }),
      "duplicate_event",
    );
  });
});
