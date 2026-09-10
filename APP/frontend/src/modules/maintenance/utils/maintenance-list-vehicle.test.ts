import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MaintenanceOrderDto } from "../types/maintenance.types.ts";

/**
 * Documents the list contract: cards/history read `vehicle` from GET /maintenance.
 * Per-row GET /maintenance/:id hydration is not part of the list path.
 */
function cardIdentity(order: MaintenanceOrderDto) {
  return {
    name: order.vehicle.displayName,
    plate: order.vehicle.plateNumber,
    photo: order.vehicle.primaryImageUrl,
    year: order.vehicle.modelYear,
  };
}

describe("maintenance list vehicle projection", () => {
  it("reads plate and name from the list row vehicle, not a follow-up detail fetch", () => {
    const order: MaintenanceOrderDto = {
      id: 42,
      vehicleId: 7,
      status: "in_service",
      maintenanceType: "mechanical",
      issueDescription: "Brake vibration",
      scheduledAt: null,
      startedAt: "2026-09-10T08:00:00.000Z",
      readyAt: null,
      completedAt: null,
      workshopName: "Al Awir Auto Care",
      odometerIn: 19840,
      expectedCompletionAt: null,
      notes: null,
      cost: 850,
      overdue: false,
      createdByUserId: 1,
      createdAt: "2026-09-10T08:00:00.000Z",
      updatedAt: "2026-09-10T08:00:00.000Z",
      vehicle: {
        id: 7,
        vehicleName: "Toyota Corolla 2025",
        displayName: "Toyota Corolla 2025",
        plateNumber: "Dubai A 45821",
        modelYear: 2025,
        color: "White",
        operationalStatus: "service",
        primaryImageUrl: "/vehicles/7/photos/primary",
      },
    };

    const card = cardIdentity(order);
    assert.equal(card.plate, "Dubai A 45821");
    assert.equal(card.name, "Toyota Corolla 2025");
    assert.equal(card.year, 2025);
    assert.equal(card.photo, "/vehicles/7/photos/primary");
  });
});
