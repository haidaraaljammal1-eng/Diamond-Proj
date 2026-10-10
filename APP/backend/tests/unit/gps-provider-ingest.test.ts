import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { providerSnapshotToIngestInput } from "src/modules/gps/gps-provider-ingest";

describe("providerSnapshotToIngestInput", () => {
  it("maps telemetry to ingest input with vehicleId", () => {
    const capturedAt = new Date("2026-10-08T16:20:46.000Z");
    const input = providerSnapshotToIngestInput(
      {
        externalDeviceId: "455",
        deviceMetadata: {},
        telemetry: {
          capturedAt,
          latitude: 25.1,
          longitude: 55.2,
          speedKph: 30,
          sourceEventId: "abc123",
          odometerValue: 100,
          odometerUnit: "METER",
        },
      },
      561,
    );
    assert.equal(input.vehicleId, 561);
    assert.equal(input.sourceEventId, "abc123");
    assert.equal(input.odometerUnit, "METER");
  });
});
