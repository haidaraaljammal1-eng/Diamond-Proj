import type { ContractPayment, FinancialLedgerKind } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import type { Tx } from "src/lib/db/transaction";
import {
  FINANCE_CURRENCY,
  PAYMENT_PURPOSE_TO_LEDGER_KIND,
} from "src/modules/finance/finance.constants";

export function isTrustedStripeCollection(
  payment: Pick<ContractPayment, "status" | "method" | "provider" | "confirmedAt">,
): boolean {
  return (
    payment.status === "CONFIRMED" &&
    payment.method === "CARD" &&
    payment.provider === "stripe" &&
    payment.confirmedAt != null
  );
}

async function insertLedgerEntry(
  tx: Tx,
  data: {
    kind: FinancialLedgerKind;
    sourceType: "CONTRACT_PAYMENT" | "MAINTENANCE_ORDER" | "MANUAL_EXPENSE";
    sourceId: string;
    dedupeKey: string;
    amount: number;
    currency: string;
    occurredAt: Date;
    contractId?: string | null;
    customerId?: number | null;
    vehicleId?: number | null;
    contractPaymentId?: string | null;
    maintenanceOrderId?: number | null;
    manualExpenseId?: string | null;
  },
): Promise<void> {
  try {
    await tx.financialLedgerEntry.create({ data });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

export async function recordStripePaymentLedger(tx: Tx, payment: ContractPayment): Promise<void> {
  if (!isTrustedStripeCollection(payment)) return;
  const kind = PAYMENT_PURPOSE_TO_LEDGER_KIND[payment.purpose];
  const contract = await tx.contract.findUnique({
    where: { id: payment.contractId },
    select: { customerId: true, vehicleId: true },
  });
  if (!contract) return;

  await insertLedgerEntry(tx, {
    kind,
    sourceType: "CONTRACT_PAYMENT",
    sourceId: payment.id,
    dedupeKey: `payment:${payment.id}`,
    amount: payment.amount,
    currency: payment.currency,
    occurredAt: payment.confirmedAt!,
    contractId: payment.contractId,
    customerId: contract.customerId,
    vehicleId: contract.vehicleId,
    contractPaymentId: payment.id,
  });
}

export async function recordMaintenanceExpenseLedger(tx: Tx, maintenanceOrderId: number): Promise<void> {
  const order = await tx.maintenanceOrder.findUnique({ where: { id: maintenanceOrderId } });
  if (!order || order.status !== "COMPLETED" || order.cost == null || !order.completedAt) return;

  await insertLedgerEntry(tx, {
    kind: "MAINTENANCE_EXPENSE",
    sourceType: "MAINTENANCE_ORDER",
    sourceId: String(maintenanceOrderId),
    dedupeKey: `maintenance:${maintenanceOrderId}`,
    amount: order.cost,
    currency: FINANCE_CURRENCY,
    occurredAt: order.completedAt,
    vehicleId: order.vehicleId,
    maintenanceOrderId,
  });
}

export async function recordManualExpenseLedger(
  tx: Tx,
  expense: { id: string; amount: number; recognizedAt: Date; vehicleId: number | null },
): Promise<void> {
  await insertLedgerEntry(tx, {
    kind: "MANUAL_EXPENSE",
    sourceType: "MANUAL_EXPENSE",
    sourceId: expense.id,
    dedupeKey: `manual-expense:${expense.id}:create`,
    amount: expense.amount,
    currency: FINANCE_CURRENCY,
    occurredAt: expense.recognizedAt,
    vehicleId: expense.vehicleId,
    manualExpenseId: expense.id,
  });
}

export async function recordManualExpenseReversalLedger(
  tx: Tx,
  expense: { id: string; amount: number; voidedAt: Date; vehicleId: number | null },
): Promise<void> {
  await insertLedgerEntry(tx, {
    kind: "MANUAL_EXPENSE_REVERSAL",
    sourceType: "MANUAL_EXPENSE",
    sourceId: expense.id,
    dedupeKey: `manual-expense:${expense.id}:void`,
    amount: expense.amount,
    currency: FINANCE_CURRENCY,
    occurredAt: expense.voidedAt,
    vehicleId: expense.vehicleId,
    manualExpenseId: expense.id,
  });
}
