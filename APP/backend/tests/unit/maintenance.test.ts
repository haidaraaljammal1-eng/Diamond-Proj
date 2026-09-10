import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMaintenanceOverdue,
  maintenanceStatusFromDto,
  maintenanceStatusToDto,
  maintenanceTypeFromDto,
  maintenanceTypeToDto,
} from "src/modules/maintenance/maintenance.mapper";

describe("maintenance mapper", () => {
  it("maps status and type enums to stable API DTOs", () => {
    assert.equal(maintenanceStatusToDto("SCHEDULED"), "scheduled");
    assert.equal(maintenanceStatusFromDto("in_service"), "IN_SERVICE");
    assert.equal(maintenanceTypeToDto("AIR_CONDITIONING"), "air_conditioning");
    assert.equal(maintenanceTypeFromDto("periodic"), "PERIODIC");
  });

  it("derives overdue for scheduled orders past scheduledAt", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    assert.equal(
      isMaintenanceOverdue(
        {
          status: "SCHEDULED",
          scheduledAt: new Date("2026-09-09T12:00:00.000Z"),
          expectedCompletionAt: null,
        },
        now,
      ),
      true,
    );
    assert.equal(
      isMaintenanceOverdue(
        {
          status: "SCHEDULED",
          scheduledAt: new Date("2026-09-11T12:00:00.000Z"),
          expectedCompletionAt: null,
        },
        now,
      ),
      false,
    );
  });

  it("derives overdue for in-service orders past expectedCompletionAt", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    assert.equal(
      isMaintenanceOverdue(
        {
          status: "IN_SERVICE",
          scheduledAt: null,
          expectedCompletionAt: new Date("2026-09-09T12:00:00.000Z"),
        },
        now,
      ),
      true,
    );
    assert.equal(
      isMaintenanceOverdue(
        {
          status: "COMPLETED",
          scheduledAt: null,
          expectedCompletionAt: new Date("2026-09-01T12:00:00.000Z"),
        },
        now,
      ),
      false,
    );
  });
});
