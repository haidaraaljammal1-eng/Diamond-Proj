import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("archive editable cell — no restore UI", () => {
  it("does not render restore button markup", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.join(dir, "../components/archive-editable-cell/archive-editable-cell.tsx"),
      "utf8",
    );
    assert.equal(source.includes("restoreBtn"), false);
    assert.equal(source.includes("onRestoreAuto"), false);
    assert.equal(source.includes("manualOverride.restoreAuto"), false);
  });
});
