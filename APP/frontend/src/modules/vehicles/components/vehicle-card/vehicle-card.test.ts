import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VehicleCardDto } from "../../types/vehicle.types.ts";
import {
  shouldShowCurrentRental,
  shouldShowRentalTimer,
} from "../../utils/rental-timer.ts";

function fixture(partial: Partial<VehicleCardDto> & Pick<VehicleCardDto, "operationalStatus">): VehicleCardDto {
  return {
    id: 1,
    vin: null,
    vehicleName: "Range Rover",
    modelId: 1,
    modelYear: 2024,
    color: "White",
    plateNumber: "A 12345",
    hourlyRate: 150,
    dailyRate: 1200,
    weeklyRate: 7392,
    monthlyRate: 24000,
    externalId: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    displayName: "Range Rover 2024",
    company: { id: 1, code: "UNIQUE", displayName: "UNIQUE", accentColor: "#C9A15C" },
    model: { id: 1, code: "RR", name: "Range Rover" },
    primaryImage: null,
    currentRental: null,
    ...partial,
  };
}

describe("VehicleCard presentation rules", () => {
  it("rented without currentRental does not show renter or timer", () => {
    const vehicle = fixture({ operationalStatus: "rented", currentRental: null });
    assert.equal(shouldShowCurrentRental(vehicle.operationalStatus, vehicle.currentRental), false);
    assert.equal(shouldShowRentalTimer(vehicle.operationalStatus, vehicle.currentRental), false);
  });

  it("rented with currentRental shows renter and timer", () => {
    const vehicle = fixture({
      operationalStatus: "rented",
      currentRental: {
        contractId: "DE-2026-0001",
        customerName: "Ahmed",
        endAt: "2026-12-01T00:00:00.000Z",
        status: "active",
      },
    });
    assert.equal(shouldShowCurrentRental(vehicle.operationalStatus, vehicle.currentRental), true);
    assert.equal(shouldShowRentalTimer(vehicle.operationalStatus, vehicle.currentRental), true);
  });

  it("available vehicle exposes core card fields", () => {
    const vehicle = fixture({ operationalStatus: "available" });
    assert.equal(vehicle.displayName, "Range Rover 2024");
    assert.equal(vehicle.plateNumber, "A 12345");
    assert.equal(vehicle.dailyRate, 1200);
    assert.equal(vehicle.monthlyRate, 24000);
    assert.equal(vehicle.primaryImage, null);
  });

  it("paid currentRental status is a valid VehicleCurrentRentalDto", () => {
    const vehicle = fixture({
      operationalStatus: "available",
      currentRental: {
        contractId: "ct-paid",
        customerName: "Omar Test",
        endAt: "2026-12-01T00:00:00.000Z",
        status: "paid",
      },
    });
    assert.equal(vehicle.currentRental?.status, "paid");
    assert.equal(vehicle.operationalStatus, "available");
  });
});
