import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVehicleCardActions } from "./vehicle-card-actions.ts";

const activeAvailable = { operationalStatus: "available" as const, isActive: true };
const activeRented = { operationalStatus: "rented" as const, isActive: true };
const activeService = { operationalStatus: "service" as const, isActive: true };
const inactiveAvailable = { operationalStatus: "available" as const, isActive: false };

describe("getVehicleCardActions", () => {
  it("AVAILABLE + manage shows rental, edit and delete", () => {
    const actions = getVehicleCardActions(activeAvailable, true);
    assert.equal(actions.showSetRentalPrice, true);
    assert.equal(actions.showEditRates, true);
    assert.equal(actions.showDelete, true);
    assert.equal(actions.showReturnLink, false);
    assert.equal(actions.showGps, false);
  });

  it("AVAILABLE variants all expose edit/delete with manage permission", () => {
    const freeText = getVehicleCardActions(
      { operationalStatus: "available", isActive: true },
      true,
    );
    const legacy = getVehicleCardActions(
      { operationalStatus: "available", isActive: true },
      true,
    );
    assert.deepEqual(freeText, legacy);
    assert.equal(freeText.showEditRates, true);
    assert.equal(freeText.showDelete, true);
  });

  it("AVAILABLE without manage hides edit/delete but keeps rental action", () => {
    const actions = getVehicleCardActions(activeAvailable, false);
    assert.equal(actions.showSetRentalPrice, true);
    assert.equal(actions.showEditRates, false);
    assert.equal(actions.showDelete, false);
  });

  it("inactive available fleet rows expose no actions", () => {
    const actions = getVehicleCardActions(inactiveAvailable, true);
    assert.deepEqual(actions, {
      showSetRentalPrice: false,
      showReturnLink: false,
      showGps: false,
      showEditRates: false,
      showDelete: false,
      showMaintenance: false,
    });
  });

  it("RENTED shows return link and GPS only even with manage", () => {
    const actions = getVehicleCardActions(activeRented, true);
    assert.equal(actions.showReturnLink, true);
    assert.equal(actions.showGps, true);
    assert.equal(actions.showSetRentalPrice, false);
    assert.equal(actions.showEditRates, false);
    assert.equal(actions.showDelete, false);
  });

  it("RENTED without currentRental still uses rented action matrix", () => {
    const actions = getVehicleCardActions(activeRented, true);
    assert.equal(actions.showReturnLink, true);
    assert.equal(actions.showEditRates, false);
  });

  it("SERVICE shows maintenance only", () => {
    const actions = getVehicleCardActions(activeService, true);
    assert.equal(actions.showMaintenance, true);
    assert.equal(actions.showSetRentalPrice, false);
    assert.equal(actions.showEditRates, false);
    assert.equal(actions.showDelete, false);
  });
});
