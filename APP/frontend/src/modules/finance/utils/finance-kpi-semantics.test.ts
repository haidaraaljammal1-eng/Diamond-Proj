import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8")) as {
  Finance: Record<string, unknown>;
};

describe("Finance KPI semantics", () => {
  it("uses approved KPI labels only", () => {
    const kpi = en.Finance.kpi as Record<string, string>;
    assert.equal(kpi.collected, "Collected");
    assert.equal(kpi.outstanding, "Outstanding");
    assert.equal(kpi.expenses, "Expenses");
    assert.equal(kpi.netMovement, "Net Movement");
  });

  it("does not label KPIs as revenue or profit", () => {
    const serialized = JSON.stringify(en.Finance.kpi);
    assert.equal(serialized.includes("Revenue"), false);
    assert.equal(serialized.includes("Profit"), false);
  });

  it("communicates outstanding as current balance", () => {
    const kpi = en.Finance.kpi as Record<string, string>;
    assert.match(kpi.outstandingCurrent, /current/i);
  });
});
