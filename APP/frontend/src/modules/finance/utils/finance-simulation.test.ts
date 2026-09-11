import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ledgerKindLabel,
  ledgerMovementLabel,
  ledgerSourceFromKind,
  ledgerSourceLabel,
  toLedgerApiFilters,
} from "./finance-labels.ts";
import { resolveFinancePeriodRange } from "./finance-period.ts";
import {
  buildFinanceSimulationOverlay,
  deriveFinanceAnalytics,
  deriveFinanceSummary,
  filterSimulatedLedger,
  FINANCE_SIMULATION_OUTSTANDING_TOTAL,
  FINANCE_SIMULATION_RECEIVABLE_COUNT,
} from "./finance-simulation.ts";
import { formatSignedFinanceAed } from "./format-finance-money.ts";

const t = (key: string) => {
  const labels: Record<string, string> = {
    "ledgerMovement.COLLECTION": "Customer Collection",
    "ledgerMovement.EXPENSE": "Expense",
    "ledgerMovement.EXPENSE_REVERSAL": "Expense Reversal",
    "ledgerSource.RENTAL_PAYMENT": "Rental Payment",
    "ledgerSource.RENEWAL_PAYMENT": "Renewal Payment",
    "ledgerSource.RECONCILIATION_PAYMENT": "Return Reconciliation",
    "ledgerSource.POST_CLOSE_RECEIVABLE_PAYMENT": "Post-Close Charge",
    "ledgerSource.MAINTENANCE_EXPENSE": "Maintenance",
    "ledgerSource.MANUAL_EXPENSE": "Manual Expense",
  };
  return labels[key] ?? key;
};

const NOW = new Date(2026, 8, 11, 12, 0, 0, 0);

describe("ledger column semantics", () => {
  it("maps Expense Reversal movement with Manual Expense source", () => {
    assert.equal(ledgerMovementLabel("EXPENSE_REVERSAL", t), "Expense Reversal");
    assert.equal(ledgerSourceFromKind("MANUAL_EXPENSE_REVERSAL"), "MANUAL_EXPENSE");
    assert.equal(ledgerSourceLabel("MANUAL_EXPENSE", t), "Manual Expense");
    assert.notEqual(ledgerSourceFromKind("MANUAL_EXPENSE_REVERSAL"), "EXPENSE_REVERSAL");
    assert.notEqual(ledgerKindLabel("MANUAL_EXPENSE_REVERSAL", t), "Expense Reversal");
  });

  it("maps rental collection as Customer Collection / Rental Payment", () => {
    assert.equal(ledgerMovementLabel("COLLECTION", t), "Customer Collection");
    assert.equal(ledgerSourceFromKind("RENTAL_PAYMENT"), "RENTAL_PAYMENT");
    assert.equal(ledgerSourceLabel("RENTAL_PAYMENT", t), "Rental Payment");
  });

  it("maps maintenance as Expense / Maintenance", () => {
    assert.equal(ledgerMovementLabel("EXPENSE", t), "Expense");
    assert.equal(ledgerSourceFromKind("MAINTENANCE_EXPENSE"), "MAINTENANCE_EXPENSE");
    assert.equal(ledgerSourceLabel("MAINTENANCE_EXPENSE", t), "Maintenance");
  });
});

describe("ledger filter mapping", () => {
  it("maps independent Movement and Source combinations onto backend params", () => {
    assert.deepEqual(toLedgerApiFilters("COLLECTION", "RENTAL_PAYMENT"), {
      kind: "RENTAL_PAYMENT",
      sourceType: null,
      direction: "COLLECTION",
    });
    assert.deepEqual(toLedgerApiFilters("COLLECTION", "RENEWAL_PAYMENT"), {
      kind: "RENEWAL_PAYMENT",
      sourceType: null,
      direction: "COLLECTION",
    });
    assert.deepEqual(toLedgerApiFilters("COLLECTION", "RECONCILIATION_PAYMENT"), {
      kind: "RECONCILIATION_PAYMENT",
      sourceType: null,
      direction: "COLLECTION",
    });
    assert.deepEqual(toLedgerApiFilters("COLLECTION", "POST_CLOSE_RECEIVABLE_PAYMENT"), {
      kind: "POST_CLOSE_RECEIVABLE_PAYMENT",
      sourceType: null,
      direction: "COLLECTION",
    });
    assert.deepEqual(toLedgerApiFilters("EXPENSE", "MAINTENANCE_EXPENSE"), {
      kind: "MAINTENANCE_EXPENSE",
      sourceType: null,
      direction: "EXPENSE",
    });
    assert.deepEqual(toLedgerApiFilters("EXPENSE", "MANUAL_EXPENSE"), {
      kind: "MANUAL_EXPENSE",
      sourceType: null,
      direction: "EXPENSE",
    });
    assert.deepEqual(toLedgerApiFilters("EXPENSE_REVERSAL", "MANUAL_EXPENSE"), {
      kind: "MANUAL_EXPENSE_REVERSAL",
      sourceType: null,
      direction: "EXPENSE_REVERSAL",
    });
    assert.deepEqual(toLedgerApiFilters(null, "MANUAL_EXPENSE"), {
      kind: null,
      sourceType: "MANUAL_EXPENSE",
      direction: null,
    });
    assert.deepEqual(toLedgerApiFilters("COLLECTION", null), {
      kind: null,
      sourceType: null,
      direction: "COLLECTION",
    });
  });
});

describe("signed amount presentation", () => {
  it("prefixes collection, expense, and reversal without relabeling reversal as collection", () => {
    assert.equal(formatSignedFinanceAed(1500, "COLLECTION"), "+ AED 1,500");
    assert.equal(formatSignedFinanceAed(850, "EXPENSE"), "- AED 850");
    assert.equal(formatSignedFinanceAed(100, "EXPENSE_REVERSAL"), "+ AED 100");
    assert.equal(ledgerMovementLabel("EXPENSE_REVERSAL", t), "Expense Reversal");
    assert.notEqual(ledgerMovementLabel("EXPENSE_REVERSAL", t), "Customer Collection");
  });
});

describe("finance simulation fixtures", () => {
  const overlay = buildFinanceSimulationOverlay(NOW);

  it("covers every movement and source combination", () => {
    const byKind = new Map(overlay.movements.map((row) => [row.kind, row]));
    assert.equal(byKind.get("RENTAL_PAYMENT")?.direction, "COLLECTION");
    assert.equal(byKind.get("RENTAL_PAYMENT")?.amount, 1500);
    assert.equal(byKind.get("RENEWAL_PAYMENT")?.amount, 500);
    assert.equal(byKind.get("RECONCILIATION_PAYMENT")?.amount, 570);
    assert.equal(byKind.get("POST_CLOSE_RECEIVABLE_PAYMENT")?.amount, 120);
    assert.equal(byKind.get("MAINTENANCE_EXPENSE")?.direction, "EXPENSE");
    assert.equal(byKind.get("MAINTENANCE_EXPENSE")?.amount, 850);
    assert.ok(overlay.movements.some((row) => row.kind === "MANUAL_EXPENSE" && row.amount === 80));
    const reversal = overlay.movements.find((row) => row.direction === "EXPENSE_REVERSAL");
    assert.ok(reversal);
    assert.equal(reversal?.amount, 100);
    assert.equal(ledgerSourceFromKind(reversal!.kind), "MANUAL_EXPENSE");
    assert.equal(reversal?.kind, "MANUAL_EXPENSE_REVERSAL");
  });

  it("includes all four open receivable types with invariant outstanding", () => {
    const types = overlay.receivables.map((row) => row.sourceType).sort();
    assert.deepEqual(types, [
      "POST_CLOSE_RECEIVABLE",
      "RECONCILIATION",
      "RENEWAL",
      "RENTAL",
    ]);
    assert.equal(overlay.receivables.length, FINANCE_SIMULATION_RECEIVABLE_COUNT);
    const total = overlay.receivables.reduce((sum, row) => sum + row.outstandingAmount, 0);
    assert.equal(total, FINANCE_SIMULATION_OUTSTANDING_TOTAL);
    assert.ok(overlay.receivables.some((row) => row.contractNumber === "DE-2026-00131"));
    assert.ok(overlay.receivables.some((row) => row.contractNumber === "DE-2026-00125"));
    assert.ok(overlay.receivables.some((row) => row.contractNumber === "DE-2026-00118"));
    assert.ok(overlay.receivables.some((row) => row.contractNumber === "DE-2026-00102"));
  });

  it("computes exact Today / Week / Month KPIs and keeps outstanding invariant", () => {
    const today = resolveFinancePeriodRange("today", undefined, undefined, NOW);
    const week = resolveFinancePeriodRange("week", undefined, undefined, NOW);
    const month = resolveFinancePeriodRange("month", undefined, undefined, NOW);

    const todaySummary = deriveFinanceSummary(overlay, today.from, today.to);
    const weekSummary = deriveFinanceSummary(overlay, week.from, week.to);
    const monthSummary = deriveFinanceSummary(overlay, month.from, month.to);

    assert.equal(todaySummary.collected, 1500);
    assert.equal(todaySummary.expenses, 80);
    assert.equal(todaySummary.netMovement, 1420);

    assert.equal(weekSummary.collected, 2690);
    assert.equal(weekSummary.expenses, 1270);
    assert.equal(weekSummary.netMovement, 1420);

    assert.equal(monthSummary.collected, 2690);
    assert.equal(monthSummary.expenses, 1520);
    assert.equal(monthSummary.netMovement, 1170);

    assert.equal(todaySummary.outstanding, FINANCE_SIMULATION_OUTSTANDING_TOTAL);
    assert.equal(weekSummary.outstanding, FINANCE_SIMULATION_OUTSTANDING_TOTAL);
    assert.equal(monthSummary.outstanding, FINANCE_SIMULATION_OUTSTANDING_TOTAL);
    assert.equal(todaySummary.openReceivablesCount, 4);
  });

  it("nets the cleaning correction chain to AED 80, not 180 or -20", () => {
    const week = resolveFinancePeriodRange("week", undefined, undefined, NOW);
    const chain = overlay.movements.filter(
      (row) =>
        row.category === "VEHICLE_CLEANING" &&
        new Date(row.occurredAt).getTime() >= new Date(week.from).getTime(),
    );
    const gross = chain
      .filter((row) => row.direction === "EXPENSE")
      .reduce((sum, row) => sum + row.amount, 0);
    const reverse = chain
      .filter((row) => row.direction === "EXPENSE_REVERSAL")
      .reduce((sum, row) => sum + row.amount, 0);
    assert.equal(gross - reverse, 80);
    assert.equal(gross, 180);
    assert.notEqual(gross - reverse, 180);
    assert.notEqual(gross - reverse, -20);
  });

  it("matches outstanding and expense breakdowns to KPIs and reduces cleaning by reversal", () => {
    const month = resolveFinancePeriodRange("month", undefined, undefined, NOW);
    const summary = deriveFinanceSummary(overlay, month.from, month.to);
    const analytics = deriveFinanceAnalytics(overlay, month.from, month.to);

    const outstandingTotal = analytics.outstandingBreakdown.reduce(
      (sum, row) => sum + row.amount,
      0,
    );
    assert.equal(outstandingTotal, summary.outstanding);
    assert.equal(analytics.outstandingBreakdown.length, 4);

    const expenseTotal = analytics.expenseBreakdown.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(expenseTotal, summary.expenses);
    assert.equal(
      analytics.expenseBreakdown.some((row) => row.category === "EXPENSE_REVERSAL"),
      false,
    );
    const cleaning = analytics.expenseBreakdown.find((row) => row.category === "VEHICLE_CLEANING");
    assert.equal(cleaning?.amount, 80);

    const trendCollected = analytics.trend.reduce((sum, row) => sum + row.collected, 0);
    const trendExpenses = analytics.trend.reduce((sum, row) => sum + row.expenses, 0);
    assert.equal(trendCollected, summary.collected);
    assert.equal(trendExpenses, summary.expenses);
  });

  it("filters movement, source, combinations, search, and clear", () => {
    const month = resolveFinancePeriodRange("month", undefined, undefined, NOW);
    const base = {
      search: "",
      from: month.from,
      to: month.to,
      direction: null,
      displaySource: null,
      page: 1,
      pageSize: 50,
      sort: "occurredAt:desc",
    } as const;

    const collections = filterSimulatedLedger(
      overlay,
      { ...base, direction: "COLLECTION" },
      "en",
    );
    assert.ok(collections.meta.total >= 4);
    assert.ok(collections.data.every((row) => row.direction === "COLLECTION"));

    const expenses = filterSimulatedLedger(overlay, { ...base, direction: "EXPENSE" }, "en");
    assert.ok(expenses.data.every((row) => row.direction === "EXPENSE"));

    const reversals = filterSimulatedLedger(
      overlay,
      { ...base, direction: "EXPENSE_REVERSAL" },
      "en",
    );
    assert.equal(reversals.meta.total, 1);
    assert.equal(reversals.data[0]?.kind, "MANUAL_EXPENSE_REVERSAL");

    for (const source of [
      "RENTAL_PAYMENT",
      "RENEWAL_PAYMENT",
      "RECONCILIATION_PAYMENT",
      "POST_CLOSE_RECEIVABLE_PAYMENT",
      "MAINTENANCE_EXPENSE",
      "MANUAL_EXPENSE",
    ] as const) {
      const result = filterSimulatedLedger(
        overlay,
        { ...base, displaySource: source },
        "en",
      );
      assert.ok(result.meta.total >= 1, `source ${source} should return rows`);
    }

    const rental = filterSimulatedLedger(
      overlay,
      { ...base, direction: "COLLECTION", displaySource: "RENTAL_PAYMENT" },
      "en",
    );
    assert.equal(rental.meta.total, 1);
    assert.equal(rental.data[0]?.kind, "RENTAL_PAYMENT");

    const renewal = filterSimulatedLedger(
      overlay,
      { ...base, direction: "COLLECTION", displaySource: "RENEWAL_PAYMENT" },
      "en",
    );
    assert.equal(renewal.data[0]?.kind, "RENEWAL_PAYMENT");

    const recon = filterSimulatedLedger(
      overlay,
      { ...base, direction: "COLLECTION", displaySource: "RECONCILIATION_PAYMENT" },
      "en",
    );
    assert.equal(recon.data[0]?.kind, "RECONCILIATION_PAYMENT");

    const postClose = filterSimulatedLedger(
      overlay,
      { ...base, direction: "COLLECTION", displaySource: "POST_CLOSE_RECEIVABLE_PAYMENT" },
      "en",
    );
    assert.equal(postClose.data[0]?.kind, "POST_CLOSE_RECEIVABLE_PAYMENT");

    const maintenance = filterSimulatedLedger(
      overlay,
      { ...base, direction: "EXPENSE", displaySource: "MAINTENANCE_EXPENSE" },
      "en",
    );
    assert.equal(maintenance.data[0]?.kind, "MAINTENANCE_EXPENSE");

    const manual = filterSimulatedLedger(
      overlay,
      { ...base, direction: "EXPENSE", displaySource: "MANUAL_EXPENSE" },
      "en",
    );
    assert.ok(manual.data.every((row) => row.kind === "MANUAL_EXPENSE"));
    assert.equal(
      manual.data.some((row) => row.kind === "MANUAL_EXPENSE_REVERSAL"),
      false,
    );

    const reversalCombo = filterSimulatedLedger(
      overlay,
      { ...base, direction: "EXPENSE_REVERSAL", displaySource: "MANUAL_EXPENSE" },
      "en",
    );
    assert.equal(reversalCombo.meta.total, 1);
    assert.equal(reversalCombo.data[0]?.direction, "EXPENSE_REVERSAL");
    assert.equal(ledgerSourceFromKind(reversalCombo.data[0]!.kind), "MANUAL_EXPENSE");

    const search = filterSimulatedLedger(
      overlay,
      { ...base, search: "DE-2026-00124" },
      "en",
    );
    assert.equal(search.meta.total, 1);

    const vendorSearch = filterSimulatedLedger(
      overlay,
      { ...base, search: "Pearl Valet" },
      "en",
    );
    assert.ok(vendorSearch.meta.total >= 1);

    const cleared = filterSimulatedLedger(overlay, { ...base }, "en");
    assert.ok(cleared.meta.total > search.meta.total);
  });

  it("does not import Finance APIs or mutate backends", () => {
    const source = readFileSync(new URL("./finance-simulation.ts", import.meta.url), "utf8");
    assert.equal(source.includes("finance.api"), false);
    assert.equal(source.includes("apiRequest"), false);
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(source), false);
  });

  it("does not treat an open receivable as a ledger collection", () => {
    const month = resolveFinancePeriodRange("month", undefined, undefined, NOW);
    const openRecon = overlay.receivables.find((row) => row.contractNumber === "DE-2026-00118");
    assert.equal(openRecon?.outstandingAmount, 570);
    assert.equal(
      overlay.movements.some(
        (row) =>
          row.contract?.contractNumber === "DE-2026-00118" && row.direction === "COLLECTION",
      ),
      false,
    );
    const paidRecon = overlay.movements.find(
      (row) => row.kind === "RECONCILIATION_PAYMENT",
    );
    assert.equal(paidRecon?.contract?.contractNumber, "DE-2026-00119");
    assert.ok(inMonth(paidRecon!.occurredAt, month.from, month.to));
  });
});

function inMonth(occurredAt: string, from: string, to: string): boolean {
  const time = new Date(occurredAt).getTime();
  return time >= new Date(from).getTime() && time < new Date(to).getTime();
}
