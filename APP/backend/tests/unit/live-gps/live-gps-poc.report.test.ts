import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSnapshots,
  classifyTimestampConsistency,
  diagnoseLiveGpsFleetRow,
} from "src/modules/gps/poc/live-gps-poc.report";
import { SANITIZED_FLEET_ROW } from "tests/fixtures/live-gps-sanitized";

describe("Live GPS PoC report helpers", () => {
  it("diagnoses valid sanitized fleet row", () => {
    assert.equal(diagnoseLiveGpsFleetRow(SANITIZED_FLEET_ROW), null);
  });

  it("classifies timestamp consistency for sanitized row", () => {
    const result = classifyTimestampConsistency(SANITIZED_FLEET_ROW);
    assert.ok(result === "consistent" || result === "skipped" || result === "inconsistent");
  });

  it("aggregates snapshot units", () => {
    const capturedAt = new Date("2026-10-08T16:20:46.000Z");
    const agg = aggregateSnapshots([
      {
        externalDeviceId: "626",
        deviceMetadata: {},
        telemetry: {
          capturedAt,
          latitude: 25.1,
          longitude: 55.2,
          speedKph: 97,
          odometerValue: 96654864.54,
          odometerUnit: "METER",
          distanceTodayValue: 299.72,
          distanceTodayUnit: "KILOMETER",
          providerExtras: { providerDeviceOnOff: "ON" },
          sourceEventId: "abc",
        },
      },
    ]);
    assert.equal(agg.withSpeed, 1);
    assert.equal(agg.withOdometer, 1);
    assert.equal(agg.withDistanceToday, 1);
    assert.equal(agg.deviceOnOffInExtrasOnly, 1);
  });
});
