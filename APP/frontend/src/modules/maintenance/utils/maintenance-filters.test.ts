import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMaintenanceQuery,
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
        companyId: null,
        sort: "newest",
      }),
      0,
    );
    assert.equal(
      countActiveFilters({
        status: "scheduled",
        search: "A 12",
        maintenanceType: "tires",
        companyId: null,
        sort: "scheduledAt",
      }),
      4,
    );
  });

  it("counts the operating-company filter", () => {
    assert.equal(
      countActiveFilters({
        status: "all",
        search: "",
        maintenanceType: null,
        companyId: 2,
        sort: "newest",
      }),
      1,
    );
  });

  it("sends companyId to the Backend and omits All Companies", () => {
    const scoped = buildMaintenanceQuery({
      status: "in_service",
      search: "",
      maintenanceType: null,
      companyId: 2,
      sort: "newest",
      page: 1,
      pageSize: 20,
    });
    assert.ok(scoped.includes("companyId=2"));

    const all = buildMaintenanceQuery({
      status: "in_service",
      search: "",
      maintenanceType: null,
      companyId: null,
      sort: "newest",
      page: 1,
      pageSize: 20,
    });
    assert.equal(all.includes("companyId"), false);
  });

  it("composes company with status, search and maintenanceType", () => {
    const query = buildMaintenanceQuery({
      status: "scheduled",
      search: "A 12345",
      maintenanceType: "tires",
      companyId: 2,
      sort: "scheduledAt",
      page: 1,
      pageSize: 20,
    });
    assert.ok(query.includes("status=scheduled"));
    assert.ok(query.includes("search=A+12345"));
    assert.ok(query.includes("maintenanceType=tires"));
    assert.ok(query.includes("companyId=2"));
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
    assert.equal(
      emptyStateKind({
        status: "all",
        hasSearch: false,
        hasType: false,
        hasCompany: true,
      }),
      "search",
    );
  });
});
