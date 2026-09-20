import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContractsQuery,
  countActiveContractFilters,
  DEFAULT_CONTRACT_FILTERS,
  CONTRACT_SORT_PARAM,
} from "./contract-filters.ts";

describe("buildContractsQuery", () => {
  it("always sends pagination and omits draft-only fields", () => {
    assert.equal(
      buildContractsQuery({ ...DEFAULT_CONTRACT_FILTERS, page: 1, pageSize: 20 }),
      "page=1&pageSize=20",
    );
  });

  it("omits status when every status is wanted", () => {
    const query = buildContractsQuery({ status: "all" });
    assert.ok(!query.includes("status="));
  });

  it("passes a narrowed status through", () => {
    assert.ok(buildContractsQuery({ status: "PAID" }).includes("status=PAID"));
  });

  it("uses the authoritative company id when narrowed", () => {
    const query = new URLSearchParams(buildContractsQuery({ companyId: 2 }));
    assert.equal(query.get("companyId"), "2");
  });

  it("trims the search term and drops a blank one", () => {
    assert.ok(buildContractsQuery({ search: " DE-2026 " }).includes("search=DE-2026"));
    assert.ok(!buildContractsQuery({ search: "   " }).includes("search="));
  });

  it("does not invent a search param from missing search", () => {
    assert.ok(!buildContractsQuery({ page: 1 }).includes("search="));
  });

  it("sends date range as ISO instants", () => {
    const query = new URLSearchParams(
      buildContractsQuery({ from: "2026-01-01", to: "2026-01-31" }),
    );
    assert.equal(query.get("from"), "2026-01-01T00:00:00.000Z");
    assert.equal(query.get("to"), "2026-01-31T23:59:59.000Z");
  });

  it("maps sort presets to Backend field:direction", () => {
    assert.ok(
      buildContractsQuery({ sort: "amountDesc" }).includes(
        `sort=${encodeURIComponent(CONTRACT_SORT_PARAM.amountDesc)}`,
      ),
    );
    assert.ok(!buildContractsQuery({ sort: "newest" }).includes("sort="));
  });

  it("resets page independently in the query object", () => {
    const query = new URLSearchParams(
      buildContractsQuery({ page: 3, pageSize: 20, search: "patrol" }),
    );
    assert.equal(query.get("page"), "3");
    assert.equal(query.get("search"), "patrol");
  });

  it("pagination is always server-side via page and pageSize", () => {
    const query = new URLSearchParams(
      buildContractsQuery({ page: 2, pageSize: 20, status: "ACTIVE" }),
    );
    assert.equal(query.get("page"), "2");
    assert.equal(query.get("pageSize"), "20");
    assert.equal(query.get("status"), "ACTIVE");
  });

  it("does not send a keystroke draft — only the applied search field", () => {
    assert.ok(!buildContractsQuery({ status: "SIGNED" }).includes("search="));
  });
});

describe("countActiveContractFilters", () => {
  it("counts nothing at rest", () => {
    assert.equal(countActiveContractFilters(DEFAULT_CONTRACT_FILTERS), 0);
  });

  it("counts each narrowed user filter once", () => {
    assert.equal(
      countActiveContractFilters({
        status: "PAID",
        search: " patrol ",
        from: "2026-01-01",
        to: "2026-01-31",
        companyId: 2,
        sort: "amountDesc",
      }),
      5,
    );
  });

  it("ignores a whitespace-only search", () => {
    assert.equal(
      countActiveContractFilters({ ...DEFAULT_CONTRACT_FILTERS, search: "   " }),
      0,
    );
  });
});
