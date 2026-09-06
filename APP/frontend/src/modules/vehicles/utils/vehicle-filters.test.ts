import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVehiclesQuery,
  countActiveFilters,
  DEFAULT_VEHICLE_FILTERS,
  VEHICLE_SORT_PARAM,
} from "./vehicle-filters.ts";

describe("buildVehiclesQuery", () => {
  it("sends only pagination and the active scope by default", () => {
    assert.equal(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, pageSize: 100 }),
      "page=1&pageSize=100&active=true",
    );
  });

  it("omits the status filter when every status is wanted", () => {
    const query = buildVehiclesQuery({ status: "all" });
    assert.ok(!query.includes("status="));
  });

  it("passes a narrowed status through", () => {
    assert.ok(buildVehiclesQuery({ status: "rented" }).includes("status=rented"));
  });

  it("trims the search term and drops a blank one", () => {
    assert.ok(buildVehiclesQuery({ search: "  patrol " }).includes("search=patrol"));
    assert.ok(!buildVehiclesQuery({ search: "   " }).includes("search="));
  });

  it("sends the model id only when one is picked", () => {
    assert.ok(buildVehiclesQuery({ modelId: 7 }).includes("modelId=7"));
    assert.ok(!buildVehiclesQuery({ modelId: null }).includes("modelId="));
  });

  it("drops the active scope when retired vehicles are included", () => {
    assert.ok(!buildVehiclesQuery({ includeInactive: true }).includes("active="));
  });

  it("maps the sort preset to the Backend field:direction form", () => {
    assert.ok(
      buildVehiclesQuery({ sort: "priceDesc" }).includes(
        `sort=${encodeURIComponent(VEHICLE_SORT_PARAM.priceDesc)}`,
      ),
    );
    assert.ok(!buildVehiclesQuery({ sort: "newest" }).includes("sort="));
  });
});

describe("countActiveFilters", () => {
  it("counts nothing at rest", () => {
    assert.equal(countActiveFilters(DEFAULT_VEHICLE_FILTERS), 0);
  });

  it("counts each narrowed filter once", () => {
    assert.equal(
      countActiveFilters({
        status: "service",
        search: " camry ",
        modelId: 3,
        includeInactive: true,
        sort: "plate",
      }),
      5,
    );
  });

  it("ignores a whitespace-only search", () => {
    assert.equal(
      countActiveFilters({ ...DEFAULT_VEHICLE_FILTERS, search: "   " }),
      0,
    );
  });
});
