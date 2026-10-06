import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ocrVisibleDateToIso } from "src/modules/document-engine/uae-driving-license-date";

describe("ocrVisibleDateToIso", () => {
  it("converts DD-MM-YYYY and DD/MM/YYYY", () => {
    assert.equal(ocrVisibleDateToIso("03-05-1990"), "1990-05-03");
    assert.equal(ocrVisibleDateToIso("13/04/2030"), "2030-04-13");
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(ocrVisibleDateToIso("31-02-2020"), null);
    assert.equal(ocrVisibleDateToIso("not-a-date"), null);
  });
});
