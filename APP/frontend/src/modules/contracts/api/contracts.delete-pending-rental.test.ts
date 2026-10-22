import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("deletePendingRentalRequest", () => {
  it("passes a plain object body to apiRequest (client JSON.stringify runs once)", () => {
    const source = readFileSync(path.join(import.meta.dirname, "contracts.api.ts"), "utf8");
    const fn =
      source.match(/export async function deletePendingRentalRequest[\s\S]*?^}/m)?.[0] ?? "";
    assert.ok(fn.length > 0, "deletePendingRentalRequest must exist");
    assert.match(fn, /\{\s*method:\s*"POST",\s*body\s*\}/);
    assert.doesNotMatch(fn, /body:\s*JSON\.stringify\(body\)/);
  });
});
