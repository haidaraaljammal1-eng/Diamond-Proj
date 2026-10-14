import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStatementContractNumber } from "src/modules/finance/finance-statement-contract";

const ELITE = 1;
const UNIQUE = 2;
const contract = { contractNumber: "DE-2026-000201", companyId: ELITE };

test("A rental payment resolves contract number from contractId", () => {
  const r = resolveStatementContractNumber("RENTAL_PAYMENT", "cid-1", contract, ELITE);
  assert.deepEqual(r, { ok: true, contractNumber: "DE-2026-000201" });
});

test("B renewal payment keeps same historical contract", () => {
  const r = resolveStatementContractNumber("RENEWAL_PAYMENT", "cid-1", contract, ELITE);
  assert.equal(r.ok && r.contractNumber, "DE-2026-000201");
});

test("C reconciliation payment resolves contract", () => {
  const r = resolveStatementContractNumber("RECONCILIATION_PAYMENT", "cid-1", contract, ELITE);
  assert.equal(r.ok && r.contractNumber, "DE-2026-000201");
});

test("D road liability payment resolves contract", () => {
  const r = resolveStatementContractNumber("ROAD_LIABILITY_PAYMENT", "cid-1", contract, ELITE);
  assert.equal(r.ok && r.contractNumber, "DE-2026-000201");
});

test("E post-close receivable resolves historical contract", () => {
  const r = resolveStatementContractNumber("POST_CLOSE_RECEIVABLE_PAYMENT", "cid-1", contract, ELITE);
  assert.equal(r.ok && r.contractNumber, "DE-2026-000201");
});

test("G maintenance without contractId shows dash path", () => {
  const r = resolveStatementContractNumber("MAINTENANCE_EXPENSE", null, undefined, ELITE);
  assert.deepEqual(r, { ok: true, contractNumber: null });
});

test("H manual expense without contractId", () => {
  const r = resolveStatementContractNumber("MANUAL_EXPENSE", null, undefined, ELITE);
  assert.deepEqual(r, { ok: true, contractNumber: null });
});

test("I missing contractId on collection fails integrity", () => {
  const r = resolveStatementContractNumber("RENTAL_PAYMENT", null, contract, ELITE);
  assert.deepEqual(r, { ok: false, reason: "missing_contract_id" });
});

test("I orphan contract fails integrity", () => {
  const r = resolveStatementContractNumber("RENTAL_PAYMENT", "cid-x", undefined, ELITE);
  assert.deepEqual(r, { ok: false, reason: "contract_not_found" });
});

test("J company mismatch fails integrity", () => {
  const r = resolveStatementContractNumber("RENTAL_PAYMENT", "cid-1", contract, UNIQUE);
  assert.deepEqual(r, { ok: false, reason: "company_mismatch" });
});
