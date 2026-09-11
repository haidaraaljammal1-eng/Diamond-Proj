import type { FastifyInstance } from "fastify";
import type { FinancialLedgerKind, FinancialLedgerSourceType } from "@prisma/client";
import { paginate, parseSort } from "src/lib/http/pagination";
import { resolveFinancePeriod } from "src/modules/finance/finance-period";
import { createFinanceAnalyticsService } from "src/modules/finance/finance-analytics.service";
import { createFinanceReceivablesService } from "src/modules/finance/finance-receivables.service";
import {
  COLLECTION_LEDGER_KINDS,
  EXPENSE_LEDGER_KINDS,
  FINANCE_CURRENCY,
  type OpenReceivableSourceType,
} from "src/modules/finance/finance.constants";
import { ledgerDirection, toCustomerSummary, toVehicleSummary } from "src/modules/finance/finance.mapper";

const LEDGER_SORT_FIELDS = ["occurredAt", "amount", "kind", "sourceType"];

export function createFinanceService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const analytics = createFinanceAnalyticsService(prisma);
  const receivables = createFinanceReceivablesService(prisma);

  return {
    async summary(query: { from?: Date; to?: Date; periodType?: "MONTH" | "QUARTER" | "YEAR" | "CUSTOM" }) {
      const period = resolveFinancePeriod(query);
      const [collected, expenses, outstanding, openReceivables] = await Promise.all([
        analytics.sumCollected(period),
        analytics.sumExpenses(period),
        receivables.totalOutstanding(),
        receivables.listOpenReceivables({ page: 1, pageSize: 1 }),
      ]);

      return {
        period: { from: period.from, to: period.to },
        collected,
        outstanding,
        expenses,
        netMovement: collected - expenses,
        openReceivablesCount: openReceivables.total,
        currency: FINANCE_CURRENCY,
        outstandingAsOf: new Date(),
      };
    },

    async analytics(query: { from?: Date; to?: Date; periodType?: "MONTH" | "QUARTER" | "YEAR" | "CUSTOM" }) {
      const period = resolveFinancePeriod(query);
      const [trend, outstandingBreakdown, expenseBreakdown] = await Promise.all([
        analytics.trend(period),
        receivables.breakdownBySource(),
        analytics.expenseBreakdown(period),
      ]);
      return {
        period: { from: period.from, to: period.to },
        currency: FINANCE_CURRENCY,
        trend,
        outstandingBreakdown,
        expenseBreakdown,
      };
    },

    async ledger(query: {
      page: number;
      pageSize: number;
      from?: Date;
      to?: Date;
      periodType?: "MONTH" | "QUARTER" | "YEAR" | "CUSTOM";
      search?: string;
      kind?: FinancialLedgerKind;
      sourceType?: FinancialLedgerSourceType;
      direction?: "COLLECTION" | "EXPENSE" | "EXPENSE_REVERSAL" | "VOIDED";
      sort?: string;
    }) {
      const period = query.from || query.to || query.periodType
        ? resolveFinancePeriod(query)
        : undefined;
      const sort = parseSort(query.sort, LEDGER_SORT_FIELDS, {
        field: "occurredAt",
        direction: "desc",
      });

      const directionWhere =
        query.direction === "COLLECTION"
          ? { kind: { in: COLLECTION_LEDGER_KINDS } }
          : query.direction === "EXPENSE"
            ? {
                kind: { in: EXPENSE_LEDGER_KINDS },
                NOT: {
                  AND: [
                    { kind: "MANUAL_EXPENSE" as const },
                    { manualExpense: { status: "VOID" as const } },
                  ],
                },
              }
            : query.direction === "VOIDED"
              ? {
                  kind: "MANUAL_EXPENSE" as const,
                  manualExpense: { status: "VOID" as const },
                }
              : query.direction === "EXPENSE_REVERSAL"
                ? { kind: "MANUAL_EXPENSE_REVERSAL" as const }
                : query.kind && query.kind !== "MANUAL_EXPENSE_REVERSAL"
                  ? { kind: query.kind }
                  : { kind: { not: "MANUAL_EXPENSE_REVERSAL" as const } };

      const where = {
        ...(period ? { occurredAt: { gte: period.from, lt: period.to } } : {}),
        ...(query.sourceType ? { sourceType: query.sourceType } : {}),
        ...directionWhere,
        ...(query.search?.trim()
          ? {
              OR: [
                { sourceId: { contains: query.search.trim(), mode: "insensitive" as const } },
                { contractId: { contains: query.search.trim(), mode: "insensitive" as const } },
                { dedupeKey: { contains: query.search.trim(), mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const result = await paginate({
        page: query.page,
        pageSize: query.pageSize,
        count: () => prisma.financialLedgerEntry.count({ where }),
        findMany: async (skip, take) => {
          const rows = await prisma.financialLedgerEntry.findMany({
            where,
            orderBy: { [sort.field]: sort.direction },
            skip,
            take,
            include: {
              contractPayment: {
                select: {
                  id: true,
                  purpose: true,
                  method: true,
                  provider: true,
                },
              },
              manualExpense: {
                select: {
                  id: true,
                  category: true,
                  description: true,
                  vendorName: true,
                  receiptNumber: true,
                  status: true,
                },
              },
              maintenanceOrder: {
                select: {
                  id: true,
                  maintenanceType: true,
                  workshopName: true,
                },
              },
            },
          });

          const contractIds = [...new Set(rows.map((row) => row.contractId).filter(Boolean))] as string[];
          const contracts = contractIds.length
            ? await prisma.contract.findMany({
                where: { id: { in: contractIds } },
                select: {
                  id: true,
                  contractNumber: true,
                  customer: { select: { id: true, name: true } },
                  vehicle: { select: { id: true, vehicleName: true, plateNumber: true } },
                },
              })
            : [];
          const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));

          return rows.map((row) => {
            const contract = row.contractId ? contractMap.get(row.contractId) : undefined;
            return {
              id: row.id,
              kind: row.kind,
              direction: ledgerDirection(row.kind),
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              amount: row.amount,
              currency: row.currency,
              occurredAt: row.occurredAt,
              contract: contract
                ? {
                    id: contract.id,
                    contractNumber: contract.contractNumber,
                  }
                : null,
              customer: toCustomerSummary(contract?.customer),
              vehicle: toVehicleSummary(contract?.vehicle),
              category:
                row.manualExpense?.category ??
                (row.kind === "MAINTENANCE_EXPENSE" ? "MAINTENANCE" : null),
              description:
                row.manualExpense?.description ??
                row.maintenanceOrder?.workshopName ??
                row.contractPayment?.purpose ??
                null,
              contractPaymentId: row.contractPaymentId,
              maintenanceOrderId: row.maintenanceOrderId,
              manualExpenseId: row.manualExpenseId,
              manualExpenseStatus: row.manualExpense?.status ?? null,
            };
          });
        },
      });

      return result;
    },

    openReceivables(query: {
      page: number;
      pageSize: number;
      search?: string;
      sourceType?: OpenReceivableSourceType;
      sort?: string;
    }) {
      return receivables.listOpenReceivables(query).then((result) => ({
        data: result.data,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
          currency: result.currency,
          outstandingAsOf: new Date(),
        },
      }));
    },
  };
}
