import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VEHICLES_PAGE_SIZE } from "../api/vehicles.api.types.ts";
import type { PageMeta } from "../api/vehicles.api.types.ts";
import {
  buildVehiclesQuery,
  countActiveFilters,
  DEFAULT_VEHICLE_FILTERS,
  VEHICLE_SORT_PARAM,
} from "./vehicle-filters.ts";
import {
  isFleetNextDisabled,
  isFleetPreviousDisabled,
  resolveFleetPageAfterFetch,
  shouldShowFleetPagination,
} from "./vehicles-pagination.ts";

function meta(overrides: Partial<PageMeta> = {}): PageMeta {
  return {
    page: 1,
    pageSize: VEHICLES_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    ...overrides,
  };
}

describe("buildVehiclesQuery — fleet pagination", () => {
  it("always sends pagination and active=true for the fleet page", () => {
    assert.equal(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, pageSize: 20 }),
      "page=1&pageSize=20&active=true",
    );
  });

  it("uses the fleet default pageSize when omitted", () => {
    const query = new URLSearchParams(buildVehiclesQuery({ page: 2 }));
    assert.equal(query.get("page"), "2");
    assert.equal(query.get("pageSize"), String(VEHICLES_PAGE_SIZE));
  });

  it("passes page through for server-side pagination", () => {
    const query = new URLSearchParams(
      buildVehiclesQuery({
        ...DEFAULT_VEHICLE_FILTERS,
        page: 2,
        pageSize: 20,
        status: "available",
      }),
    );
    assert.equal(query.get("page"), "2");
    assert.equal(query.get("pageSize"), "20");
    assert.equal(query.get("status"), "available");
    assert.equal(query.get("active"), "true");
  });

  it("does not client-side slice — query carries page only", () => {
    const query = buildVehiclesQuery({ page: 6, pageSize: 20 });
    assert.ok(query.includes("page=6"));
    assert.ok(!query.includes("limit"));
    assert.ok(!query.includes("offset"));
  });
});

describe("buildVehiclesQuery — filters", () => {
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

  it("sends the authoritative company id only when selected", () => {
    const query = new URLSearchParams(buildVehiclesQuery({ companyId: 2 }));
    assert.equal(query.get("companyId"), "2");
    assert.ok(!buildVehiclesQuery({ companyId: null }).includes("companyId="));
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

describe("Fleet pagination controls", () => {
  it("page 1 of 2: previous disabled, next enabled", () => {
    const pageMeta = meta({ page: 1, total: 21, totalPages: 2 });
    assert.equal(isFleetPreviousDisabled(pageMeta), true);
    assert.equal(isFleetNextDisabled(pageMeta), false);
    assert.equal(shouldShowFleetPagination(pageMeta), true);
  });

  it("page 2 of 2: previous enabled, next disabled", () => {
    const pageMeta = meta({ page: 2, total: 21, totalPages: 2 });
    assert.equal(isFleetPreviousDisabled(pageMeta), false);
    assert.equal(isFleetNextDisabled(pageMeta), true);
  });

  it("101 vehicles at pageSize 20 yields six pages", () => {
    const pageMeta = meta({ page: 1, total: 101, totalPages: 6 });
    assert.equal(pageMeta.totalPages, 6);
    assert.equal(shouldShowFleetPagination(pageMeta), true);
    assert.equal(
      new URLSearchParams(
        buildVehiclesQuery({ page: 6, pageSize: 20 }),
      ).get("page"),
      "6",
    );
  });

  it("hides pagination when only one page exists", () => {
    assert.equal(shouldShowFleetPagination(meta({ total: 12, totalPages: 1 })), false);
    assert.equal(shouldShowFleetPagination(null), false);
  });
});

describe("resolveFleetPageAfterFetch", () => {
  it("corrects an invalid page after mutation shrinks totalPages", () => {
    assert.equal(
      resolveFleetPageAfterFetch(3, meta({ page: 3, total: 35, totalPages: 2 }), 0),
      2,
    );
  });

  it("returns null when the current page is valid", () => {
    assert.equal(
      resolveFleetPageAfterFetch(2, meta({ page: 2, total: 35, totalPages: 2 }), 15),
      null,
    );
  });

  it("returns null for a genuine empty fleet", () => {
    assert.equal(resolveFleetPageAfterFetch(1, meta({ total: 0, totalPages: 0 }), 0), null);
  });
});

describe("filter changes reset page to 1 (query contract)", () => {
  it("search submit sends page=1", () => {
    const query = new URLSearchParams(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, search: "patrol" }),
    );
    assert.equal(query.get("page"), "1");
    assert.equal(query.get("search"), "patrol");
  });

  it("clear search sends page=1 without search param", () => {
    const query = new URLSearchParams(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, search: "" }),
    );
    assert.equal(query.get("page"), "1");
    assert.ok(!query.has("search"));
  });

  it("status filter sends page=1", () => {
    const query = new URLSearchParams(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, status: "rented" }),
    );
    assert.equal(query.get("page"), "1");
    assert.equal(query.get("status"), "rented");
  });

  it("vehicle type filter sends page=1", () => {
    const query = new URLSearchParams(
      buildVehiclesQuery({
        ...DEFAULT_VEHICLE_FILTERS,
        page: 1,
        vehicleType: "Toyota Camry",
      }),
    );
    assert.equal(query.get("page"), "1");
    assert.equal(query.get("vehicleType"), "Toyota Camry");
  });

  it("sort change sends page=1", () => {
    const query = new URLSearchParams(
      buildVehiclesQuery({ ...DEFAULT_VEHICLE_FILTERS, page: 1, sort: "plate" }),
    );
    assert.equal(query.get("page"), "1");
    assert.equal(query.get("sort"), VEHICLE_SORT_PARAM.plate);
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
        companyId: 2,
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
