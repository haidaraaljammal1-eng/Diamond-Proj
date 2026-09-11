import type { FinancialLedgerKind, ManualExpenseCategory, PrismaClient } from "@prisma/client";
import { env } from "src/config/env";
import type { Period } from "src/modules/reports/periods";
import {
  COLLECTION_LEDGER_KINDS,
  EXPENSE_LEDGER_KINDS,
  FINANCE_CURRENCY,
} from "src/modules/finance/finance.constants";

function dayKey(date: Date, offsetMinutes: number): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function enumerateDays(period: Period, offsetMinutes: number): string[] {
  const days: string[] = [];
  const cursor = new Date(period.from);
  while (cursor < period.to) {
    days.push(dayKey(cursor, offsetMinutes));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
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
      for (const day of enumerateDays(period, offsetMinutes)) {
        buckets.set(day, { collected: 0, expenses: 0 });
      }

      for (const entry of entries) {
        const key = dayKey(entry.occurredAt, offsetMinutes);
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

    currency: FINANCE_CURRENCY,
  };
}
