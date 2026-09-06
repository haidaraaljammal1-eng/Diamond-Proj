import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSwitchClassName } from "./switch.utils.ts";

const styles = {
  switch: "switch",
  checked: "checked",
};

describe("buildSwitchClassName", () => {
  it("includes base switch class", () => {
    assert.equal(buildSwitchClassName(styles), "switch");
  });

  it("adds checked variant", () => {
    assert.equal(buildSwitchClassName(styles, { checked: true }), "switch checked");
  });

  it("merges caller className", () => {
    assert.equal(
      buildSwitchClassName(styles, { checked: true, className: "end" }),
      "switch checked end",
    );
  });
});
