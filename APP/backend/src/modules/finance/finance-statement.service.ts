import type { FinancialLedgerKind, OperatingCompany, PrismaClient } from "@prisma/client";
import type { Language } from "src/config/i18n";
import { env } from "src/config/env";
import {
  COLLECTION_LEDGER_KINDS,
  EXPENSE_LEDGER_KINDS,
  FINANCE_CURRENCY,
} from "src/modules/finance/finance.constants";
import {
  financeStatementCompanyNotFoundError,
  financeStatementContractIntegrityError,
} from "src/modules/finance/finance.errors";
import { resolveStatementContractNumber } from "src/modules/finance/finance-statement-contract";
import { ledgerDirection } from "src/modules/finance/finance.mapper";
import {
  invoiceBrandingForCompany,
  type InvoiceBrandKey,
} from "src/modules/invoices/invoice-company-branding";
import { businessDayKey } from "src/modules/reports/periods";
import {
  resolveFinanceStatementPeriod,
  statementPeriodFilenameRange,
  type FinanceStatementExportQuery,
} from "src/modules/finance/finance-statement-period";
import { COMPANY_REF_SELECT } from "src/modules/operating-companies/company-ref";

const STATEMENT_KINDS: FinancialLedgerKind[] = [
  ...COLLECTION_LEDGER_KINDS,
  ...EXPENSE_LEDGER_KINDS,
  "MANUAL_EXPENSE_REVERSAL",
];

export type StatementCompanyCode = "ELITE" | "UNIQUE";

export interface FinanceStatementLine {
  id: string;
  occurredAt: Date;
  businessDay: string;
  kind: FinancialLedgerKind;
  direction: ReturnType<typeof ledgerDirection>;
  categoryLabel: string;
  referenceId: string;
  contractNumber: string | null;
  vehicleName: string | null;
  plateNumber: string | null;
  description: string | null;
  vendorName: string | null;
  paymentMethodLabel: string | null;
  moneyIn: number;
  moneyOut: number;
  adjustment: number;
  cumulativeNet: number;
}

export interface FinanceStatementDayGroup {
  day: string;
  moneyIn: number;
  moneyOut: number;
  adjustment: number;
  net: number;
  lines: FinanceStatementLine[];
}

export interface FinanceStatementSnapshot {
  locale: Language;
  companyCode: StatementCompanyCode;
  brandKey: InvoiceBrandKey;
  companyDisplayName: string;
  companyLegalName: string;
  currency: string;
  period: { from: Date; to: Date };
  periodLabel: { from: string; to: string };
  offsetMinutes: number;
  timezoneLabel: string;
  generatedAt: Date;
  summary: {
    totalCollections: number;
    grossExpenses: number;
    expenseReversals: number;
    netExpenses: number;
    netMovement: number;
  };
  dayGroups: FinanceStatementDayGroup[];
  lines: FinanceStatementLine[];
}

function kindCategoryLabel(kind: FinancialLedgerKind, locale: Language): string {
  const ar: Record<FinancialLedgerKind, string> = {
    RENTAL_PAYMENT: "تحصيل إيجار",
    RENEWAL_PAYMENT: "تحصيل تجديد",
    RECONCILIATION_PAYMENT: "تحصيل مطابقة",
    POST_CLOSE_RECEIVABLE_PAYMENT: "تحصيل بعد الإغلاق",
    ROAD_LIABILITY_PAYMENT: "تحصيل التزام مروري",
    MAINTENANCE_EXPENSE: "مصروف صيانة",
    MANUAL_EXPENSE: "مصروف يدوي",
    MANUAL_EXPENSE_REVERSAL: "عكس مصروف يدوي",
  };
  const en: Record<FinancialLedgerKind, string> = {
    RENTAL_PAYMENT: "Rental collection",
    RENEWAL_PAYMENT: "Renewal collection",
    RECONCILIATION_PAYMENT: "Reconciliation collection",
    POST_CLOSE_RECEIVABLE_PAYMENT: "Post-close collection",
    ROAD_LIABILITY_PAYMENT: "Road liability collection",
    MAINTENANCE_EXPENSE: "Maintenance expense",
    MANUAL_EXPENSE: "Manual expense",
    MANUAL_EXPENSE_REVERSAL: "Manual expense reversal",
  };
  return (locale === "ar" ? ar : en)[kind];
}

function paymentMethodLabel(
  method: string | null | undefined,
  locale: Language,
): string | null {
  if (!method) return null;
  if (method === "CASH") return locale === "ar" ? "كاش / ماكينة" : "Cash / Card Machine";
  if (method === "CARD") return locale === "ar" ? "بطاقة" : "Card";
  return method;
}

export function createFinanceStatementService(prisma: PrismaClient) {
  async function loadSnapshot(
    companyCode: StatementCompanyCode,
    query: FinanceStatementExportQuery,
  ): Promise<FinanceStatementSnapshot> {
    const locale = query.locale ?? "ar";
    const periodResolved = resolveFinanceStatementPeriod(query);
    const { from, to, offsetMinutes } = periodResolved;

    const company = await prisma.operatingCompany.findFirst({
      where: { code: companyCode },
      select: { ...COMPANY_REF_SELECT, legalNameEn: true },
    });
    if (!company) throw financeStatementCompanyNotFoundError();

    const branding = invoiceBrandingForCompany(company as OperatingCompany);
    const rows = await prisma.financialLedgerEntry.findMany({
      where: {
        companyId: company.id,
        occurredAt: { gte: from, lt: to },
        kind: { in: STATEMENT_KINDS },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      include: {
        contractPayment: {
          select: { id: true, purpose: true, method: true, provider: true },
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
          select: { id: true, maintenanceType: true, workshopName: true },
        },
      },
    });

    const contractIds = [...new Set(rows.map((r) => r.contractId).filter(Boolean))] as string[];
    const contracts = contractIds.length
      ? await prisma.contract.findMany({
          where: { id: { in: contractIds } },
          select: {
            id: true,
            contractNumber: true,
            companyId: true,
            vehicle: { select: { vehicleName: true, plateNumber: true } },
          },
        })
      : [];
    const contractMap = new Map(contracts.map((c) => [c.id, c]));

    let cumulative = 0;
    let totalCollections = 0;
    let grossExpenses = 0;
    let expenseReversals = 0;
    const contractIntegrityFailures: string[] = [];

    const lines: FinanceStatementLine[] = rows.map((row) => {
      const direction = ledgerDirection(row.kind);
      const contract = row.contractId ? contractMap.get(row.contractId) : undefined;
      const contractResolved = resolveStatementContractNumber(
        row.kind,
        row.contractId,
        contract,
        company.id,
      );
      if (!contractResolved.ok) {
        contractIntegrityFailures.push(row.id);
      }
      const contractNumber = contractResolved.ok ? contractResolved.contractNumber : null;
      let moneyIn = 0;
      let moneyOut = 0;
      let adjustment = 0;
      if (direction === "COLLECTION") {
        moneyIn = row.amount;
        totalCollections += row.amount;
        cumulative += row.amount;
      } else if (direction === "EXPENSE") {
        moneyOut = row.amount;
        grossExpenses += row.amount;
        cumulative -= row.amount;
      } else {
        adjustment = row.amount;
        expenseReversals += row.amount;
        cumulative += row.amount;
      }

      const description =
        row.manualExpense?.description ??
        row.maintenanceOrder?.workshopName ??
        row.contractPayment?.purpose ??
        null;

      return {
        id: row.id,
        occurredAt: row.occurredAt,
        businessDay: businessDayKey(row.occurredAt, offsetMinutes),
        kind: row.kind,
        direction,
        categoryLabel: kindCategoryLabel(row.kind, locale),
        referenceId: row.sourceId,
        contractNumber,
        vehicleName: contract?.vehicle.vehicleName ?? null,
        plateNumber: contract?.vehicle.plateNumber ?? null,
        description,
        vendorName: row.manualExpense?.vendorName ?? row.maintenanceOrder?.workshopName ?? null,
        paymentMethodLabel: paymentMethodLabel(row.contractPayment?.method, locale),
        moneyIn,
        moneyOut,
        adjustment,
        cumulativeNet: cumulative,
      };
    });

    if (contractIntegrityFailures.length > 0) {
      throw financeStatementContractIntegrityError(contractIntegrityFailures);
    }

    const netExpenses = grossExpenses - expenseReversals;
    const netMovement = totalCollections - netExpenses;

    const dayMap = new Map<string, FinanceStatementDayGroup>();
    for (const line of lines) {
      let group = dayMap.get(line.businessDay);
      if (!group) {
        group = {
          day: line.businessDay,
          moneyIn: 0,
          moneyOut: 0,
          adjustment: 0,
          net: 0,
          lines: [],
        };
        dayMap.set(line.businessDay, group);
      }
      group.lines.push(line);
      group.moneyIn += line.moneyIn;
      group.moneyOut += line.moneyOut;
      group.adjustment += line.adjustment;
      group.net += line.moneyIn - line.moneyOut + line.adjustment;
    }

    const offsetHours = offsetMinutes / 60;
    const sign = offsetHours >= 0 ? "+" : "";
    const timezoneLabel = `UTC${sign}${offsetHours}`;

    return {
      locale,
      companyCode,
      brandKey: branding.brandKey,
      companyDisplayName: branding.displayName,
      companyLegalName: branding.legalHeaderEn,
      currency: FINANCE_CURRENCY,
      period: { from, to },
      periodLabel: statementPeriodFilenameRange({ from, to }, offsetMinutes),
      offsetMinutes,
      timezoneLabel,
      generatedAt: new Date(),
      summary: {
        totalCollections,
        grossExpenses,
        expenseReversals,
        netExpenses,
        netMovement,
      },
      dayGroups: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
      lines,
    };
  }

  return { loadSnapshot };
}
