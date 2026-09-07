import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVehiclesQuery,
  countActiveFilters,
  DEFAULT_VEHICLE_FILTERS,
  VEHICLE_SORT_PARAM,
} from "./vehicle-filters.ts";

describe("buildVehiclesQuery", () => {
  it("always sends pagination and active=true for the fleet page", () => {
    assert.equal(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, pageSize: 100 }),
      "page=1&pageSize=100&active=true",
    );
  });

  it("omits the status filter when every status is wanted", () => {
    const query = buildVehiclesQuery({ status: "all" });
    assert.ok(!query.includes("status="));
    assert.ok(query.includes("active=true"));
  });

  it("passes a narrowed status through", () => {
    assert.ok(buildVehiclesQuery({ status: "rented" }).includes("status=rented"));
  });

  it("trims the search term and drops a blank one", () => {
    assert.ok(buildVehiclesQuery({ search: "  patrol " }).includes("search=patrol"));
    assert.ok(!buildVehiclesQuery({ search: "   " }).includes("search="));
  });

  it("sends vehicleType only when one is picked", () => {
    const query = buildVehiclesQuery({ vehicleType: "Toyota Land Cruiser" });
    assert.equal(
      new URLSearchParams(query).get("vehicleType"),
      "Toyota Land Cruiser",
    );
    assert.ok(!buildVehiclesQuery({ vehicleType: null }).includes("vehicleType="));
  });

  it("maps the sort preset to the Backend field:direction form", () => {
    assert.ok(
      buildVehiclesQuery({ sort: "priceDesc" }).includes(
        `sort=${encodeURIComponent(VEHICLE_SORT_PARAM.priceDesc)}`,
      ),
    );
    assert.ok(
      buildVehiclesQuery({ sort: "priceAsc" }).includes(
        `sort=${encodeURIComponent(VEHICLE_SORT_PARAM.priceAsc)}`,
      ),
    );
    assert.ok(!buildVehiclesQuery({ sort: "newest" }).includes("sort="));
  });
});

describe("countActiveFilters", () => {
  it("counts nothing at rest", () => {
    assert.equal(countActiveFilters(DEFAULT_VEHICLE_FILTERS), 0);
  });

  it("counts each narrowed user filter once", () => {
    assert.equal(
      countActiveFilters({
        status: "service",
        search: " camry ",
        vehicleType: "Toyota Camry",
        sort: "plate",
      }),
      4,
    );
  });

  it("ignores a whitespace-only search", () => {
    assert.equal(
      countActiveFilters({ ...DEFAULT_VEHICLE_FILTERS, search: "   " }),
      0,
    );
  });
});
