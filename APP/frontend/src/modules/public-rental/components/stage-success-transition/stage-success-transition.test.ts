import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STAGE_SUCCESS_DURATION_MS } from "../../constants/stage-success.ts";

describe("stage success transition constants", () => {
  it("uses a 2000ms visual hold", () => {
    assert.equal(STAGE_SUCCESS_DURATION_MS, 2000);
  });
});
