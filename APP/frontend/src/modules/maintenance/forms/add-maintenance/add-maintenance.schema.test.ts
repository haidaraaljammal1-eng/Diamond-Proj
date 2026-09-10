import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMaintenanceFormSchema,
  toCreateMaintenancePayload,
} from "./add-maintenance.schema.ts";

const valid = {
  vehicleId: "12",
  issueDescription: "Brake vibration",
  maintenanceType: "mechanical" as const,
  startMode: "now" as const,
  scheduledDate: "",
  scheduledTime: "",
  workshopName: "",
  odometerIn: "",
  expectedDate: "",
  expectedTime: "",
  cost: "",
  notes: "",
};

describe("addMaintenanceFormSchema", () => {
  it("requires vehicle and issue", () => {
    const missingVehicle = addMaintenanceFormSchema.safeParse({
      ...valid,
      vehicleId: "",
    });
    assert.equal(missingVehicle.success, false);

    const missingIssue = addMaintenanceFormSchema.safeParse({
      ...valid,
      issueDescription: "  ",
    });
    assert.equal(missingIssue.success, false);
  });

  it("requires scheduled date and time in scheduled mode", () => {
    const result = addMaintenanceFormSchema.safeParse({
      ...valid,
      startMode: "scheduled",
      scheduledDate: "",
      scheduledTime: "",
    });
    assert.equal(result.success, false);
  });

  it("rejects negative cost and odometer", () => {
    assert.equal(
      addMaintenanceFormSchema.safeParse({ ...valid, cost: "-1" }).success,
      false,
    );
    assert.equal(
      addMaintenanceFormSchema.safeParse({ ...valid, odometerIn: "-5" }).success,
      false,
    );
  });

  it("maps now mode without scheduledAt and omits empty cost", () => {
    const parsed = addMaintenanceFormSchema.parse(valid);
    const payload = toCreateMaintenancePayload(parsed);
    assert.equal(payload.vehicleId, 12);
    assert.equal(payload.startMode, "now");
    assert.equal(payload.scheduledAt, undefined);
    assert.equal(payload.cost, undefined);
  });
});
