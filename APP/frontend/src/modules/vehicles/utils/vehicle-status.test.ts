import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVehicleStatusPresentation } from "./vehicle-status.ts";

describe("vehicle-status", () => {
  it("maps available to ok tone", () => {
    assert.deepEqual(getVehicleStatusPresentation("available"), {
      translationKey: "statusAvailable",
      tone: "ok",
    });
  });

  it("maps rented to gold tone", () => {
    assert.deepEqual(getVehicleStatusPresentation("rented"), {
      translationKey: "statusRented",
      tone: "gold",
    });
  });

  it("maps service to warn tone", () => {
    assert.deepEqual(getVehicleStatusPresentation("service"), {
      translationKey: "statusService",
      tone: "warn",
    });
  });

  it("maps paid currentRental to Ready for Car-Out gold chip", () => {
    assert.deepEqual(getVehicleStatusPresentation("available", "paid"), {
      translationKey: "statusReadyForCarOut",
      tone: "gold",
    });
  });
});
