import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCardClassName } from "./card.utils.ts";

const styles = {
  card: "card",
  interactive: "interactive",
  selected: "selected",
  paddingDefault: "paddingDefault",
  paddingCompact: "paddingCompact",
  paddingNone: "paddingNone",
};

describe("buildCardClassName", () => {
  it("includes the base card class by default", () => {
    assert.equal(buildCardClassName(styles), "card paddingDefault");
  });

  it("merges interactive and selected variants", () => {
    assert.equal(
      buildCardClassName(styles, { interactive: true, selected: true }),
      "card interactive selected paddingDefault",
    );
  });

  it("supports compact and none padding", () => {
    assert.equal(
      buildCardClassName(styles, { padding: "compact" }),
      "card paddingCompact",
    );
    assert.equal(
      buildCardClassName(styles, { padding: "none" }),
      "card paddingNone",
    );
  });

  it("appends caller className last", () => {
    assert.equal(
      buildCardClassName(styles, { className: "extra" }),
      "card paddingDefault extra",
    );
  });
});
