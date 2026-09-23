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

/** Trusted customer collections: Stripe CARD confirmations and explicit CASH collections. */
export function isTrustedCustomerCollection(
  payment: Pick<ContractPayment, "status" | "method" | "provider" | "confirmedAt">,
): boolean {
  if (payment.status !== "CONFIRMED" || payment.confirmedAt == null) return false;
  if (payment.method === "CASH") return payment.provider == null;
  return isTrustedStripeCollection(payment);
}

/**
 * Every ledger entry persists its company AT WRITE TIME, from its own
 * authoritative source: Contract-based movements use the Contract's frozen
 * company, maintenance uses its Vehicle's company, and a Manual Expense uses the
 * classification the expense already carries. `null` is a real answer — a
 * vehicle-less Manual Expense is GENERAL — and is never replaced by a default.
 */
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
    companyId: number | null;
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

export async function recordTrustedCollectionLedger(tx: Tx, payment: ContractPayment): Promise<void> {
  if (!isTrustedCustomerCollection(payment)) return;
  const kind = PAYMENT_PURPOSE_TO_LEDGER_KIND[payment.purpose];
  const contract = await tx.contract.findUnique({
    where: { id: payment.contractId },
    select: { customerId: true, vehicleId: true, companyId: true },
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
    // The Contract's frozen company, never the Vehicle's current owner.
    companyId: contract.companyId,
    contractId: payment.contractId,
    customerId: contract.customerId,
    vehicleId: contract.vehicleId,
    contractPaymentId: payment.id,
  });
}

/** @deprecated Use recordTrustedCollectionLedger — kept for Stripe-specific call sites. */
export async function recordStripePaymentLedger(tx: Tx, payment: ContractPayment): Promise<void> {
  return recordTrustedCollectionLedger(tx, payment);
}

export async function recordMaintenanceExpenseLedger(tx: Tx, maintenanceOrderId: number): Promise<void> {
  const order = await tx.maintenanceOrder.findUnique({
    where: { id: maintenanceOrderId },
    include: { vehicle: { select: { companyId: true } } },
  });
  if (!order || order.status !== "COMPLETED" || order.cost == null || !order.completedAt) return;

  await insertLedgerEntry(tx, {
    kind: "MAINTENANCE_EXPENSE",
    sourceType: "MAINTENANCE_ORDER",
    sourceId: String(maintenanceOrderId),
    dedupeKey: `maintenance:${maintenanceOrderId}`,
    amount: order.cost,
    currency: FINANCE_CURRENCY,
    occurredAt: order.completedAt,
    // MaintenanceOrder carries no company of its own; it derives from its Vehicle.
    companyId: order.vehicle.companyId,
    vehicleId: order.vehicleId,
    maintenanceOrderId,
  });
}

export function manualExpenseCreateDedupeKey(expenseId: string): string {
  return `manual-expense:${expenseId}:create`;
}

/**
 * The Manual Expense owns the classification; the ledger copies it verbatim.
 * `companyId: null` means GENERAL and is written as null.
 */
interface ManualExpenseLedgerSource {
  id: string;
  amount: number;
  recognizedAt: Date;
  vehicleId: number | null;
  companyId: number | null;
}

export async function recordManualExpenseLedger(
  tx: Tx,
  expense: ManualExpenseLedgerSource,
): Promise<void> {
  await insertLedgerEntry(tx, {
    kind: "MANUAL_EXPENSE",
    sourceType: "MANUAL_EXPENSE",
    sourceId: expense.id,
    dedupeKey: manualExpenseCreateDedupeKey(expense.id),
    amount: expense.amount,
    currency: FINANCE_CURRENCY,
    occurredAt: expense.recognizedAt,
    companyId: expense.companyId,
    vehicleId: expense.vehicleId,
    manualExpenseId: expense.id,
  });
}

/** Rebuildable projection: keep the same create row, update current values. */
export async function reprojectManualExpenseLedger(
  tx: Tx,
  expense: ManualExpenseLedgerSource,
): Promise<void> {
  const result = await tx.financialLedgerEntry.updateMany({
    where: {
      dedupeKey: manualExpenseCreateDedupeKey(expense.id),
      kind: "MANUAL_EXPENSE",
    },
    data: {
      amount: expense.amount,
      occurredAt: expense.recognizedAt,
      vehicleId: expense.vehicleId,
      companyId: expense.companyId,
    },
  });
  if (result.count === 0) {
    await recordManualExpenseLedger(tx, expense);
  }
}

export async function recordRoadLiabilityPaymentLedger(tx: Tx, payment: ContractPayment): Promise<void> {
  if (
    payment.purpose !== "ROAD_LIABILITY" ||
    !isTrustedCustomerCollection(payment)
  ) {
    return;
  }
  const charge = await tx.roadLiabilityCustomerCharge.findUnique({
    where: { id: payment.targetId },
    include: {
      roadLiability: { select: { id: true } },
      contract: { select: { customerId: true, vehicleId: true, companyId: true } },
    },
  });
  if (!charge) return;

  await insertLedgerEntry(tx, {
    kind: "ROAD_LIABILITY_PAYMENT",
    sourceType: "CONTRACT_PAYMENT",
    sourceId: payment.id,
    dedupeKey: `road-liability:${charge.roadLiabilityId}`,
    amount: payment.amount,
    currency: payment.currency,
    occurredAt: payment.confirmedAt!,
    companyId: charge.contract.companyId,
    contractId: charge.contractId,
    customerId: charge.contract.customerId,
    vehicleId: charge.contract.vehicleId,
    contractPaymentId: payment.id,
  });
}

export async function recordManualExpenseReversalLedger(
  tx: Tx,
  expense: { id: string; amount: number; voidedAt: Date; vehicleId: number | null; companyId: number | null },
): Promise<void> {
  await insertLedgerEntry(tx, {
    kind: "MANUAL_EXPENSE_REVERSAL",
    sourceType: "MANUAL_EXPENSE",
    sourceId: expense.id,
    dedupeKey: `manual-expense:${expense.id}:void`,
    amount: expense.amount,
    currency: FINANCE_CURRENCY,
    occurredAt: expense.voidedAt,
    companyId: expense.companyId,
    vehicleId: expense.vehicleId,
    manualExpenseId: expense.id,
  });
}
