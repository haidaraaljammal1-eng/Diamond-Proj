import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCancelMaintenance,
  canCompleteMaintenance,
  canEditMaintenance,
  canMarkReady,
  canStartMaintenance,
  getMaintenanceStatusPresentation,
  OVERDUE_PRESENTATION,
} from "./maintenance-status.ts";

describe("maintenance status presentation", () => {
  it("maps backend statuses to chip tones without an OVERDUE enum", () => {
    assert.equal(getMaintenanceStatusPresentation("scheduled").tone, "gold");
    assert.equal(getMaintenanceStatusPresentation("in_service").tone, "warn");
    assert.equal(getMaintenanceStatusPresentation("ready_for_pickup").tone, "ok");
    assert.equal(OVERDUE_PRESENTATION.tone, "bad");
    assert.equal(OVERDUE_PRESENTATION.translationKey, "status.overdue");
  });

  it("gates lifecycle actions by persisted status", () => {
    assert.equal(canStartMaintenance("scheduled"), true);
    assert.equal(canStartMaintenance("in_service"), false);
    assert.equal(canMarkReady("in_service"), true);
    assert.equal(canCompleteMaintenance("ready_for_pickup"), true);
    assert.equal(canCancelMaintenance("scheduled"), true);
    assert.equal(canCancelMaintenance("in_service"), false);
    assert.equal(canEditMaintenance("completed"), false);
    assert.equal(canEditMaintenance("in_service"), true);
  });
});
