import { test } from "node:test";
import assert from "node:assert/strict";
import {
  companyScopeWhere,
  contractCompanyScopeWhere,
  resolveFinanceCompanyScope,
} from "src/modules/finance/finance-company-scope";

test("no company query means ALL, which adds no predicate and keeps GENERAL", () => {
  const scope = resolveFinanceCompanyScope({});
  assert.deepEqual(scope, { kind: "ALL" });
  // Not `{ companyId: { not: null } }` — that would silently drop GENERAL rows.
  assert.deepEqual(companyScopeWhere(scope), {});
  assert.equal(contractCompanyScopeWhere(scope), undefined);
});

test("companyScope=ALL is the same as omitting it", () => {
  assert.deepEqual(resolveFinanceCompanyScope({ companyScope: "ALL" }), { kind: "ALL" });
});

test("a real company id filters that company exactly", () => {
  const scope = resolveFinanceCompanyScope({ companyId: 7 });
  assert.deepEqual(scope, { kind: "COMPANY", companyId: 7 });
  assert.deepEqual(companyScopeWhere(scope), { companyId: 7 });
  assert.deepEqual(contractCompanyScopeWhere(scope), { companyId: 7 });
});

test("GENERAL is companyId IS NULL, never a company relation", () => {
  const scope = resolveFinanceCompanyScope({ companyScope: "GENERAL" });
  assert.deepEqual(scope, { kind: "GENERAL" });
  assert.deepEqual(companyScopeWhere(scope), { companyId: null });
  // A Contract always carries a company, so GENERAL has no contract predicate.
  assert.equal(contractCompanyScopeWhere(scope), undefined);
});

test("GENERAL combined with a companyId is refused rather than silently resolved", () => {
  assert.throws(
    () => resolveFinanceCompanyScope({ companyScope: "GENERAL", companyId: 7 }),
    (error: unknown) =>
      (error as { context?: { reason?: string } }).context?.reason ===
      "FINANCE_COMPANY_SCOPE_CONFLICT",
  );
});
