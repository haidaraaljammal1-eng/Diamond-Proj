import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContractsQuery,
  countActiveContractFilters,
  DEFAULT_CONTRACT_FILTERS,
} from "./contract-filters.ts";

describe("Contracts date range integration", () => {
  it("apply range sends from/to ISO instants and resets page in query builder", () => {
    const query = new URLSearchParams(
      buildContractsQuery({
        ...DEFAULT_CONTRACT_FILTERS,
        page: 1,
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    );
    assert.equal(query.get("page"), "1");
    assert.equal(query.get("from"), "2026-09-01T00:00:00.000Z");
    assert.equal(query.get("to"), "2026-09-30T23:59:59.000Z");
  });

  it("clear removes from/to params from the built query", () => {
    const query = buildContractsQuery({
      ...DEFAULT_CONTRACT_FILTERS,
      page: 1,
      from: "",
      to: "",
    });
    assert.ok(!query.includes("from="));
    assert.ok(!query.includes("to="));
  });

  it("counts the date range as one active filter", () => {
    assert.equal(
      countActiveContractFilters({
        ...DEFAULT_CONTRACT_FILTERS,
        from: "2026-09-01",
        to: "2026-09-30",
      }),
      1,
    );
  });

  it("counts only one filter when a single side is set", () => {
    assert.equal(
      countActiveContractFilters({
        ...DEFAULT_CONTRACT_FILTERS,
        from: "2026-09-01",
        to: "",
      }),
      1,
    );
  });
});
