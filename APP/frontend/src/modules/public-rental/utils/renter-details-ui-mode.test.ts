import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOriginalRenterFormEditable,
  isReviewBlockEditable,
  resolveRenterDetailsUiMode,
} from "./renter-details-ui-mode.ts";

describe("renter details single edit surface", () => {
  it("entry: original form editable, review not editable", () => {
    const mode = resolveRenterDetailsUiMode(false, false);
    assert.equal(mode, "entry");
    assert.equal(isOriginalRenterFormEditable(mode), true);
    assert.equal(isReviewBlockEditable(mode), false);
  });

  it("review: original locked, review read-only", () => {
    const mode = resolveRenterDetailsUiMode(true, false);
    assert.equal(mode, "review");
    assert.equal(isOriginalRenterFormEditable(mode), false);
    assert.equal(isReviewBlockEditable(mode), false);
  });

  it("review edit: original still locked, only review editable", () => {
    const mode = resolveRenterDetailsUiMode(true, true);
    assert.equal(mode, "reviewEdit");
    assert.equal(isOriginalRenterFormEditable(mode), false);
    assert.equal(isReviewBlockEditable(mode), true);
  });

  it("clicking edit must not reopen original form", () => {
    assert.equal(isOriginalRenterFormEditable(resolveRenterDetailsUiMode(true, true)), false);
  });
});
