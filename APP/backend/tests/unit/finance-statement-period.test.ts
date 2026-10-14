import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveFinanceStatementBusinessToday,
  resolveFinanceStatementPeriod,
} from "src/modules/finance/finance-statement-period";
import { resolveBusinessDay } from "src/modules/reports/periods";

test("TODAY uses business calendar day [start, next day)", () => {
  const period = resolveFinanceStatementPeriod({ periodType: "TODAY", locale: "en" });
  const expected = resolveBusinessDay(new Date(), period.offsetMinutes);
  assert.equal(period.from.getTime(), expected.from.getTime());
  assert.equal(period.to.getTime(), expected.to.getTime());
  const now = new Date();
  assert.ok(now >= period.from && now < period.to);
});

test("resolveFinanceStatementBusinessToday matches TODAY boundaries", () => {
  const today = resolveFinanceStatementBusinessToday();
  const period = resolveFinanceStatementPeriod({ periodType: "TODAY", locale: "ar" });
  const expected = resolveBusinessDay(new Date(), today.offsetMinutes);
  assert.equal(period.from.getTime(), expected.from.getTime());
  assert.match(today.businessDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(today.displayAr.length > 0);
  assert.ok(today.displayEn.length > 0);
});
