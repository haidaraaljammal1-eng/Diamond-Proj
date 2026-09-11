import type { Prisma, PrismaClient } from "@prisma/client";
import type { OpenReceivableSourceType } from "src/modules/finance/finance.constants";
import { FINANCE_CURRENCY } from "src/modules/finance/finance.constants";
import {
  type OpenReceivableRow,
  toCustomerSummary,
  toVehicleSummary,
} from "src/modules/finance/finance.mapper";

const TRUSTED_STRIPE_PAYMENT: Prisma.ContractPaymentWhereInput = {
  status: "CONFIRMED",
  method: "CARD",
  provider: "stripe",
  confirmedAt: { not: null },
};

const CONTRACT_INCLUDE = {
  customer: { select: { id: true, name: true } },
  vehicle: { select: { id: true, vehicleName: true, plateNumber: true } },
  acceptance: { select: { acceptedAt: true } },
} as const;

function latestPaymentState(
  payments: { id: string; status: string }[],
): { paymentState: string; latestPaymentId: string | null } {
  const latest = payments[0];
  return {
    paymentState: latest?.status ?? "UNPAID",
    latestPaymentId: latest?.id ?? null,
  };
}

function matchesSearch(row: OpenReceivableRow, search?: string): boolean {
  if (!search?.trim()) return true;
  const q = search.trim().toLowerCase();
  return (
    row.contractNumber.toLowerCase().includes(q) ||
    row.customer?.name.toLowerCase().includes(q) ||
    row.vehicle?.vehicleName?.toLowerCase().includes(q) ||
    row.vehicle?.plateNumber?.toLowerCase().includes(q) ||
    row.sourceId.toLowerCase().includes(q)
  );
}

export function createFinanceReceivablesService(prisma: PrismaClient) {
  async function fetchRentalOutstanding(): Promise<OpenReceivableRow[]> {
    const contracts = await prisma.contract.findMany({
      where: {
        status: "SIGNED",
        NOT: {
          payments: {
            some: {
              purpose: "RENTAL",
              ...TRUSTED_STRIPE_PAYMENT,
            },
          },
        },
      },
      include: {
        ...CONTRACT_INCLUDE,
        payments: {
          where: { purpose: "RENTAL" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });

    return contracts.map((contract) => {
      const paymentMeta = latestPaymentState(contract.payments);
      const amountDue = contract.agreedAmount;
      return {
        sourceType: "RENTAL" as const,
        sourceId: contract.id,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        customer: toCustomerSummary(contract.customer),
        vehicle: toVehicleSummary(contract.vehicle),
        amountDue,
        amountPaid: 0,
        outstandingAmount: amountDue,
        currency: contract.currency,
        obligationCreatedAt: contract.acceptance?.acceptedAt ?? contract.updatedAt,
        paymentState: paymentMeta.paymentState,
        paymentPurpose: "RENTAL",
        latestPaymentId: paymentMeta.latestPaymentId,
      };
    });
  }

  async function fetchRenewalOutstanding(): Promise<OpenReceivableRow[]> {
    const renewals = await prisma.contractRenewal.findMany({
      where: {
        approvedAt: { not: null },
        appliedAt: null,
        additionalAmount: { gt: 0 },
        NOT: {
          settledPayment: TRUSTED_STRIPE_PAYMENT,
        },
      },
      include: {
        contract: {
          include: {
            ...CONTRACT_INCLUDE,
          },
        },
        settledPayment: { select: { id: true, status: true } },
      },
    });

    return renewals.map((renewal) => {
      const contract = renewal.contract;
      const latestPayments = renewal.settledPayment
        ? [{ id: renewal.settledPayment.id, status: renewal.settledPayment.status }]
        : [];
      const paymentMeta = latestPaymentState(latestPayments);
      const amountDue = renewal.additionalAmount;
      return {
        sourceType: "RENEWAL" as const,
        sourceId: renewal.id,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        customer: toCustomerSummary(contract.customer),
        vehicle: toVehicleSummary(contract.vehicle),
        amountDue,
        amountPaid: 0,
        outstandingAmount: amountDue,
        currency: contract.currency,
        obligationCreatedAt: renewal.approvedAt!,
        paymentState: paymentMeta.paymentState,
        paymentPurpose: "RENEWAL",
        latestPaymentId: paymentMeta.latestPaymentId,
      };
    });
  }

  async function fetchReconciliationOutstanding(): Promise<OpenReceivableRow[]> {
    const reconciliations = await prisma.contractReconciliation.findMany({
      where: {
        approvedAt: { not: null },
        settledAt: null,
        finalAmount: { gt: 0 },
      },
      include: {
        contract: {
          include: CONTRACT_INCLUDE,
        },
        settledPayment: { select: { id: true, status: true } },
      },
    });

    return reconciliations.map((reconciliation) => {
      const contract = reconciliation.contract;
      const latestPayments = reconciliation.settledPayment
        ? [{ id: reconciliation.settledPayment.id, status: reconciliation.settledPayment.status }]
        : [];
      const paymentMeta = latestPaymentState(latestPayments);
      const amountDue = reconciliation.finalAmount;
      return {
        sourceType: "RECONCILIATION" as const,
        sourceId: reconciliation.id,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        customer: toCustomerSummary(contract.customer),
        vehicle: toVehicleSummary(contract.vehicle),
        amountDue,
        amountPaid: 0,
        outstandingAmount: amountDue,
        currency: contract.currency,
        obligationCreatedAt: reconciliation.approvedAt!,
        paymentState: paymentMeta.paymentState,
        paymentPurpose: "RECONCILIATION",
        latestPaymentId: paymentMeta.latestPaymentId,
      };
    });
  }

  async function fetchPostCloseOutstanding(): Promise<OpenReceivableRow[]> {
    const receivables = await prisma.contractPostCloseReceivable.findMany({
      where: {
        status: "OPEN",
        amount: { gt: 0 },
      },
      include: {
        contract: {
          include: CONTRACT_INCLUDE,
        },
        settledPayment: { select: { id: true, status: true } },
      },
    });

    return receivables.map((receivable) => {
      const contract = receivable.contract;
      const latestPayments = receivable.settledPayment
        ? [{ id: receivable.settledPayment.id, status: receivable.settledPayment.status }]
        : [];
      const paymentMeta = latestPaymentState(latestPayments);
      const amountDue = receivable.amount;
      return {
        sourceType: "POST_CLOSE_RECEIVABLE" as const,
        sourceId: receivable.id,
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        customer: toCustomerSummary(contract.customer),
        vehicle: toVehicleSummary(contract.vehicle),
        amountDue,
        amountPaid: 0,
        outstandingAmount: amountDue,
        currency: receivable.currency,
        obligationCreatedAt: receivable.createdAt,
        paymentState: paymentMeta.paymentState,
        paymentPurpose: "POST_CLOSE_RECEIVABLE",
        latestPaymentId: paymentMeta.latestPaymentId,
      };
    });
  }

  async function listAll(sourceType?: OpenReceivableSourceType): Promise<OpenReceivableRow[]> {
    const rows: OpenReceivableRow[] = [];
    if (!sourceType || sourceType === "RENTAL") rows.push(...(await fetchRentalOutstanding()));
    if (!sourceType || sourceType === "RENEWAL") rows.push(...(await fetchRenewalOutstanding()));
    if (!sourceType || sourceType === "RECONCILIATION") {
      rows.push(...(await fetchReconciliationOutstanding()));
    }
    if (!sourceType || sourceType === "POST_CLOSE_RECEIVABLE") {
      rows.push(...(await fetchPostCloseOutstanding()));
    }
    return rows;
  }

  return {
    async totalOutstanding(): Promise<number> {
      const rows = await listAll();
      return rows.reduce((sum, row) => sum + row.outstandingAmount, 0);
    },

    async breakdownBySource(): Promise<
      { sourceType: OpenReceivableSourceType; count: number; amount: number }[]
    > {
      const rows = await listAll();
      const map = new Map<OpenReceivableSourceType, { count: number; amount: number }>();
      for (const type of ["RENTAL", "RENEWAL", "RECONCILIATION", "POST_CLOSE_RECEIVABLE"] as const) {
        map.set(type, { count: 0, amount: 0 });
      }
      for (const row of rows) {
        const entry = map.get(row.sourceType)!;
        entry.count += 1;
        entry.amount += row.outstandingAmount;
      }
      return [...map.entries()].map(([sourceType, value]) => ({
        sourceType,
        ...value,
      }));
    },

    async listOpenReceivables(query: {
      page: number;
      pageSize: number;
      search?: string;
      sourceType?: OpenReceivableSourceType;
      sort?: string;
    }) {
      let rows = await listAll(query.sourceType);
      rows = rows.filter((row) => matchesSearch(row, query.search));

      const sort = query.sort ?? "obligationCreatedAt:asc";
      const [field, direction] = sort.split(":");
      const dir = direction === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        if (field === "amount") return (a.outstandingAmount - b.outstandingAmount) * dir;
        if (field === "sourceType") return a.sourceType.localeCompare(b.sourceType) * dir;
        return (a.obligationCreatedAt.getTime() - b.obligationCreatedAt.getTime()) * dir;
      });

      const total = rows.length;
      const skip = (query.page - 1) * query.pageSize;
      const data = rows.slice(skip, skip + query.pageSize);
      return { data, total, currency: FINANCE_CURRENCY };
    },
  };
}
