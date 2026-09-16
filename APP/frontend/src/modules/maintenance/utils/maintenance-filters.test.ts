import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countActiveFilters,
  emptyStateKind,
  isActiveMaintenanceStatus,
  toBackendStatusParam,
} from "./maintenance-filters.ts";

describe("maintenance filters", () => {
  it("omits all from the backend status param", () => {
    assert.equal(toBackendStatusParam("all"), undefined);
    assert.equal(toBackendStatusParam("in_service"), "in_service");
    assert.equal(toBackendStatusParam("overdue"), "overdue");
  });

  it("counts only user-applied filters", () => {
    assert.equal(
      countActiveFilters({
        status: "all",
        search: "",
        maintenanceType: null,
        sort: "newest",
      }),
      0,
    );
    assert.equal(
      countActiveFilters({
        status: "scheduled",
        search: "A 12",
        maintenanceType: "tires",
        sort: "scheduledAt",
      }),
      4,
    );
  });

  it("treats completed as inactive", () => {
    assert.equal(isActiveMaintenanceStatus("scheduled"), true);
    assert.equal(isActiveMaintenanceStatus("completed"), false);
    assert.equal(isActiveMaintenanceStatus("cancelled"), false);
  });

  it("maps empty-state kinds from the toolbar", () => {
    assert.equal(
      emptyStateKind({ status: "all", hasSearch: false, hasType: false }),
      "active",
    );
    assert.equal(
      emptyStateKind({ status: "scheduled", hasSearch: false, hasType: false }),
      "scheduled",
    );
    assert.equal(
      emptyStateKind({ status: "all", hasSearch: true, hasType: false }),
      "search",
    );
    assert.equal(
      emptyStateKind({ status: "completed", hasSearch: false, hasType: false }),
      "history",
    );
  });
});
