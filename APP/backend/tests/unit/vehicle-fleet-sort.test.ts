import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveFleetAttentionTier,
  sortFleetVehicleIds,
  type FleetSortRow,
} from "src/modules/vehicles/vehicle-fleet-sort";

function row(id: number, status: FleetSortRow["operationalStatus"] = "AVAILABLE"): FleetSortRow {
  return {
    id,
    createdAt: new Date(`2026-01-${String(id).padStart(2, "0")}T00:00:00.000Z`),
    dailyRate: 100,
    monthlyRate: 2000,
    modelYear: 2024,
    plateNumber: `P-${id}`,
    vin: null,
    operationalStatus: status,
    isActive: true,
  };
}

describe("vehicle fleet priority sort", () => {
  it("orders handover before urgent before standard", () => {
    const rows = [row(3), row(1), row(2)];
    const rentals = new Map([
      [2, { status: "paid" as const, awaitingHandover: true }],
    ]);
    const followUps = new Map([
      [
        3,
        [
          {
            contractId: "u",
            contractNumber: "U",
            status: "awaiting" as const,
            customerName: null,
          },
        ],
      ],
    ]);
    const ids = sortFleetVehicleIds(rows, rentals, followUps, "createdAt", "desc");
    assert.deepEqual(ids, [2, 3, 1]);
  });

  it("does not mark urgent when a blocking rental exists", () => {
    const tier = resolveFleetAttentionTier(
      { operationalStatus: "RENTED", isActive: true },
      { status: "active", awaitingHandover: false },
      [
        {
          contractId: "u",
          contractNumber: "U",
          status: "awaiting",
          customerName: null,
        },
      ],
    );
    assert.equal(tier, null);
  });
});
