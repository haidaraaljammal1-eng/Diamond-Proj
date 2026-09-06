import assert from "node:assert/strict";
import { describe, it } from "node:test";

const FILTERS = ["all", "available", "rented", "service"] as const;

describe("Vehicle filters", () => {
  it("exposes only the four demo filters", () => {
    assert.deepEqual(FILTERS, ["all", "available", "rented", "service"]);
  });

  it("maps active filter to backend status query", () => {
    const toQuery = (filter: (typeof FILTERS)[number]) =>
      filter === "all" ? undefined : filter;
    assert.equal(toQuery("all"), undefined);
    assert.equal(toQuery("available"), "available");
    assert.equal(toQuery("rented"), "rented");
    assert.equal(toQuery("service"), "service");
  });
});
