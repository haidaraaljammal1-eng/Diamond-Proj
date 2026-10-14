import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FN } from "./keys.ts";
import { FUNCTIONAL_PAGES, FUNCTIONAL_CAPABILITY_REGISTRY } from "./manifest.ts";
import { applyFunctionalGrantToggle } from "./checkbox-transitions.ts";
import { normalizeFunctionalGrants } from "./policy-engine.ts";

describe("functional RBAC checkbox transitions", () => {
  it("exposes 12 page groups and 34 capabilities", () => {
    assert.equal(FUNCTIONAL_PAGES.length, 12);
    assert.equal(FUNCTIONAL_CAPABILITY_REGISTRY.length, 34);
  });

  it("checking a child adds parent automatically", () => {
    const next = applyFunctionalGrantToggle([], FN.finance.addExpense, true);
    assert.equal(next.includes(FN.finance.viewPage), true);
    assert.equal(next.includes(FN.finance.addExpense), true);
  });

  it("unchecking parent removes children", () => {
    const start = normalizeFunctionalGrants([
      FN.finance.viewPage,
      FN.finance.addExpense,
      FN.finance.correctExpense,
    ]);
    const next = applyFunctionalGrantToggle(start, FN.finance.viewPage, false);
    assert.equal(next.includes(FN.finance.addExpense), false);
    assert.equal(next.includes(FN.finance.viewPage), false);
  });

  it("unchecking one child keeps parent when siblings remain", () => {
    const start = normalizeFunctionalGrants([
      FN.finance.addExpense,
      FN.finance.correctExpense,
    ]);
    const next = applyFunctionalGrantToggle(start, FN.finance.addExpense, false);
    assert.equal(next.includes(FN.finance.viewPage), true);
    assert.equal(next.includes(FN.finance.correctExpense), true);
    assert.equal(next.includes(FN.finance.addExpense), false);
  });

  it("TYPE A single permission toggles independently", () => {
    const on = applyFunctionalGrantToggle([], FN.gps.full, true);
    assert.deepEqual(on, [FN.gps.full]);
    const off = applyFunctionalGrantToggle(on, FN.gps.full, false);
    assert.deepEqual(off, []);
  });
});
