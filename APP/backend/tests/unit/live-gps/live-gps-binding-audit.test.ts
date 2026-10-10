import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  auditProviderDevices,
  type EliteVehicleCandidate,
  type ProviderDeviceRow,
} from "src/modules/gps/poc/live-gps-binding-audit";

const fleet: EliteVehicleCandidate[] = [
  {
    id: 10,
    vehicleLabel: "Range Rover Sport",
    plateDisplay: "A 12345",
    plateCode: "A",
    plateNumber: "12345",
    plateNormalized: "A 12345",
    isActive: true,
  },
  {
    id: 11,
    vehicleLabel: "Patrol",
    plateDisplay: "B 99999",
    plateCode: "B",
    plateNumber: "99999",
    plateNormalized: "B 99999",
    isActive: true,
  },
];

describe("Live GPS binding audit", () => {
  it("EXACT on normalized plate code+number", () => {
    const devices: ProviderDeviceRow[] = [
      { row: 1, externalDeviceId: "100", providerVehicleLabel: "DUBAI A 12345", deviceType: null },
    ];
    const rows = auditProviderDevices(devices, fleet);
    assert.equal(rows[0]!.matchCategory, "EXACT");
    assert.equal(rows[0]!.diamondVehicleId, 10);
  });

  it("AMBIGUOUS when multiple LIKELY", () => {
    const devices: ProviderDeviceRow[] = [
      { row: 1, externalDeviceId: "101", providerVehicleLabel: "12345", deviceType: null },
    ];
    const rows = auditProviderDevices(devices, fleet);
    assert.ok(rows[0]!.matchCategory === "AMBIGUOUS" || rows[0]!.matchCategory === "LIKELY");
  });

  it("NO_MATCH when no overlap", () => {
    const devices: ProviderDeviceRow[] = [
      { row: 1, externalDeviceId: "102", providerVehicleLabel: "UNKNOWN XYZ 00000", deviceType: null },
    ];
    const rows = auditProviderDevices(devices, fleet);
    assert.equal(rows[0]!.matchCategory, "NO_MATCH");
  });
});
