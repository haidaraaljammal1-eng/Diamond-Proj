import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveContractsListView } from "./contract-list-view.ts";

describe("resolveContractsListView", () => {
  it("loading keeps the page mounted while the first request is in flight", () => {
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: false,
        itemCount: 0,
        activeFilterCount: 0,
        hasError: false,
      }),
      "loading",
    );
  });

  it("empty has no fake contracts", () => {
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: true,
        itemCount: 0,
        activeFilterCount: 0,
        hasError: false,
      }),
      "empty",
    );
  });

  it("filtered empty is distinct from a true empty desk", () => {
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: true,
        itemCount: 0,
        activeFilterCount: 2,
        hasError: false,
      }),
      "filteredEmpty",
    );
  });

  it("ready when the backend returns rows", () => {
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: true,
        itemCount: 4,
        activeFilterCount: 1,
        hasError: false,
      }),
      "ready",
    );
  });
});
