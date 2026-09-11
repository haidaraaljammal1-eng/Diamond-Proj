import type { FinancialLedgerKind, ManualExpenseCategory, PrismaClient } from "@prisma/client";
import { env } from "src/config/env";
import {
  businessDayKey,
  enumerateBusinessDays,
  type Period,
} from "src/modules/reports/periods";
import {
  COLLECTION_LEDGER_KINDS,
  EXPENSE_LEDGER_KINDS,
  FINANCE_CURRENCY,
} from "src/modules/finance/finance.constants";

export const FINANCE_MOVEMENT_BREAKDOWN_KEYS = [
  "RENTAL_PAYMENT",
  "RENEWAL_PAYMENT",
  "RECONCILIATION_PAYMENT",
  "POST_CLOSE_RECEIVABLE_PAYMENT",
  "MAINTENANCE_EXPENSE",
  "MANUAL_EXPENSE",
] as const;

export type FinanceMovementBreakdownKey = (typeof FINANCE_MOVEMENT_BREAKDOWN_KEYS)[number];

export interface FinanceMovementSlice {
  key: FinanceMovementBreakdownKey;
  direction: "COLLECTION" | "EXPENSE";
  amount: number;
}

const COLLECTION_BREAKDOWN_KEYS: FinanceMovementBreakdownKey[] = [
  "RENTAL_PAYMENT",
  "RENEWAL_PAYMENT",
  "RECONCILIATION_PAYMENT",
  "POST_CLOSE_RECEIVABLE_PAYMENT",
];

/** Net Manual Expense for a window: current amount minus any void reversal. */
export function assembleFinanceMovementBreakdown(
  amountByKind: ReadonlyMap<string, number>,
): FinanceMovementSlice[] {
  const manualNet =
    (amountByKind.get("MANUAL_EXPENSE") ?? 0) -
    (amountByKind.get("MANUAL_EXPENSE_REVERSAL") ?? 0);

  const slices: FinanceMovementSlice[] = [
    ...COLLECTION_BREAKDOWN_KEYS.map((key) => ({
      key,
      direction: "COLLECTION" as const,
      amount: amountByKind.get(key) ?? 0,
    })),
    {
      key: "MAINTENANCE_EXPENSE",
      direction: "EXPENSE",
      amount: amountByKind.get("MAINTENANCE_EXPENSE") ?? 0,
    },
    { key: "MANUAL_EXPENSE", direction: "EXPENSE", amount: manualNet },
  ];
  return slices.filter((slice) => slice.amount !== 0);
}

export function createFinanceAnalyticsService(prisma: PrismaClient) {
  const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;

  async function sumCollected(period: Period): Promise<number> {
    const result = await prisma.financialLedgerEntry.aggregate({
      where: {
        kind: { in: COLLECTION_LEDGER_KINDS },
        occurredAt: { gte: period.from, lt: period.to },
      },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  async function sumExpenses(period: Period): Promise<number> {
    const [expenses, reversals] = await Promise.all([
      prisma.financialLedgerEntry.aggregate({
        where: {
          kind: { in: EXPENSE_LEDGER_KINDS },
          occurredAt: { gte: period.from, lt: period.to },
        },
        _sum: { amount: true },
      }),
      prisma.financialLedgerEntry.aggregate({
        where: {
          kind: "MANUAL_EXPENSE_REVERSAL",
          occurredAt: { gte: period.from, lt: period.to },
        },
        _sum: { amount: true },
      }),
    ]);
    return (expenses._sum.amount ?? 0) - (reversals._sum.amount ?? 0);
  }

  return {
    sumCollected,
    sumExpenses,

    async trend(period: Period) {
      const entries = await prisma.financialLedgerEntry.findMany({
        where: { occurredAt: { gte: period.from, lt: period.to } },
        select: { kind: true, amount: true, occurredAt: true },
      });

      const buckets = new Map<string, { collected: number; expenses: number }>();
      for (const day of enumerateBusinessDays(period, offsetMinutes)) {
        buckets.set(day, { collected: 0, expenses: 0 });
      }

      for (const entry of entries) {
        const key = businessDayKey(entry.occurredAt, offsetMinutes);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        if ((COLLECTION_LEDGER_KINDS as FinancialLedgerKind[]).includes(entry.kind)) {
          bucket.collected += entry.amount;
        } else if ((EXPENSE_LEDGER_KINDS as FinancialLedgerKind[]).includes(entry.kind)) {
          bucket.expenses += entry.amount;
        } else if (entry.kind === "MANUAL_EXPENSE_REVERSAL") {
          bucket.expenses -= entry.amount;
        }
      }

      return [...buckets.entries()].map(([date, values]) => ({
        date,
        collected: values.collected,
        expenses: values.expenses,
        netMovement: values.collected - values.expenses,
      }));
    },

    async expenseBreakdown(period: Period) {
      const maintenance = await prisma.financialLedgerEntry.aggregate({
        where: {
          kind: "MAINTENANCE_EXPENSE",
          occurredAt: { gte: period.from, lt: period.to },
        },
        _sum: { amount: true },
      });

      const manualEntries = await prisma.financialLedgerEntry.findMany({
        where: {
          kind: { in: ["MANUAL_EXPENSE", "MANUAL_EXPENSE_REVERSAL"] },
          occurredAt: { gte: period.from, lt: period.to },
          manualExpenseId: { not: null },
        },
        select: {
          kind: true,
          amount: true,
          manualExpense: { select: { category: true } },
        },
      });

      const manualByCategory = new Map<ManualExpenseCategory, number>();
      for (const entry of manualEntries) {
        const category = entry.manualExpense?.category;
        if (!category) continue;
        const current = manualByCategory.get(category) ?? 0;
        if (entry.kind === "MANUAL_EXPENSE") manualByCategory.set(category, current + entry.amount);
        else manualByCategory.set(category, current - entry.amount);
      }

      const rows = [
        {
          category: "MAINTENANCE" as const,
          amount: maintenance._sum.amount ?? 0,
        },
        ...[...manualByCategory.entries()].map(([category, amount]) => ({
          category,
          amount,
        })),
      ].filter((row) => row.amount !== 0);

      return rows;
    },

    async movementBreakdown(period: Period): Promise<FinanceMovementSlice[]> {
      const groups = await prisma.financialLedgerEntry.groupBy({
        by: ["kind"],
        where: { occurredAt: { gte: period.from, lt: period.to } },
        _sum: { amount: true },
      });
      const amountByKind = new Map<string, number>();
      for (const group of groups) {
        amountByKind.set(group.kind, group._sum.amount ?? 0);
      }
      return assembleFinanceMovementBreakdown(amountByKind);
    },

    currency: FINANCE_CURRENCY,
  };
}
