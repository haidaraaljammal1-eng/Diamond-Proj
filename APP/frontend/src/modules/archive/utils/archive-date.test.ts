import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveDateFromApi, archiveDateToApi } from "./archive-date.ts";

describe("archive-date", () => {
  it("reads YYYY-MM-DD from UTC-midnight ISO without timezone shift", () => {
    assert.equal(archiveDateFromApi("2026-09-23T00:00:00.000Z"), "2026-09-23");
  });

  it("writes null for empty date input", () => {
    assert.equal(archiveDateToApi(""), null);
    assert.equal(archiveDateToApi("   "), null);
  });

  it("round-trips calendar dates", () => {
    assert.equal(archiveDateToApi("2026-01-15"), "2026-01-15");
  });
});
