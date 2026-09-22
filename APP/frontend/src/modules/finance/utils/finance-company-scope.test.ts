import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  appendFinanceCompanyScope,
  financeCompanyScopeQuery,
  isLatestFinanceRequest,
} from "./finance-company-scope.ts";

const MODULE_DIR = path.join(import.meta.dirname, "..");

function read(relative: string): string {
  return readFileSync(path.join(MODULE_DIR, relative), "utf8");
}

describe("Finance company scope requests", () => {
  it("sends no company parameter for ALL", () => {
    assert.equal(financeCompanyScopeQuery({ kind: "ALL" }), "");
    assert.equal(
      appendFinanceCompanyScope("/finance/summary?from=a&to=b", { kind: "ALL" }),
      "/finance/summary?from=a&to=b",
    );
  });

  it("sends companyId for a real company", () => {
    assert.equal(financeCompanyScopeQuery({ kind: "COMPANY", companyId: 4 }), "companyId=4");
    assert.equal(
      appendFinanceCompanyScope("/finance/ledger?from=a&to=b&direction=EXPENSE", {
        kind: "COMPANY",
        companyId: 9,
      }),
      "/finance/ledger?from=a&to=b&direction=EXPENSE&companyId=9",
    );
  });

  it("sends companyScope=GENERAL and never a fake company id", () => {
    assert.equal(financeCompanyScopeQuery({ kind: "GENERAL" }), "companyScope=GENERAL");
    assert.equal(financeCompanyScopeQuery({ kind: "GENERAL" }).includes("companyId"), false);
  });

  it("composes the scope with the existing ledger filters in the API", () => {
    const api = read("api/finance.api.ts");
    for (const name of ["getFinanceSummary", "getFinanceAnalytics", "getOpenReceivables", "getFinanceLedger"]) {
      assert.ok(api.includes(name));
    }
    assert.ok(api.includes("appendFinanceCompanyScope"));
    assert.ok(api.includes('params.set("search"'));
    assert.ok(api.includes('params.set("direction"'));
    assert.ok(api.includes('params.set("kind"'));
    assert.equal(api.includes("companyId="), false, "the API must not hardcode a company id");
  });

  it("keeps the latest scope when responses overlap", () => {
    assert.equal(isLatestFinanceRequest(1, 3), false);
    assert.equal(isLatestFinanceRequest(3, 3), true);
    const store = read("stores/finance.store.ts");
    assert.ok(store.includes("overviewSeq"));
    assert.ok(store.includes("isLatestFinanceRequest"));
    assert.ok(store.includes("companyScope"));
  });
});

describe("Finance company rendering", () => {
  it("renders a real company with CompanyIdentity and null as GENERAL", () => {
    const source = read("components/finance-classification/finance-classification.tsx");
    const general = source.slice(source.indexOf("company === null"));
    assert.ok(source.includes("CompanyIdentity"));
    assert.ok(general.includes('data-testid="finance-general"'));
    assert.equal(general.includes("CompanyIdentity"), false);
    assert.equal(source.includes("accentColor"), false);
    assert.equal(source.includes('"UNIQUE"'), false);
    assert.equal(source.includes('"ELITE"'), false);
  });

  it("offers ALL, live companies and GENERAL without hardcoded company codes", () => {
    const source = read("components/finance-scope-control/finance-scope-control.tsx");
    assert.ok(source.includes('value: "ALL"'));
    assert.ok(source.includes('value: "GENERAL"'));
    assert.ok(source.includes("useOperatingCompanies"));
    assert.ok(source.includes("company.displayName"));
    assert.equal(source.includes('"UNIQUE"'), false);
    assert.equal(source.includes('"ELITE"'), false);
  });

  it("does not add a company field to the manual expense dialog", () => {
    const schema = read("forms/add-expense/add-expense.schema.ts");
    const dialog = read("forms/add-expense/add-expense-dialog.tsx");
    const correct = read("forms/correct-expense/correct-expense-dialog.tsx");
    assert.equal(schema.includes("companyId"), false);
    assert.equal(dialog.includes("companyId"), false);
    assert.equal(correct.includes("companyId"), false);
    assert.ok(dialog.includes("FinanceVehiclePicker"));
    assert.ok(schema.includes("vehicleId"));
    assert.ok(schema.includes("category"));
    assert.ok(schema.includes("recognizedAt"));
    assert.ok(schema.includes("description"));
    assert.ok(schema.includes("amount"));
    const payload = schema.slice(schema.indexOf("function toCreateManualExpensePayload"));
    assert.equal(payload.includes("company"), false);
  });
});
