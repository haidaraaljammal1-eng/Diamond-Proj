import type { ContractPaymentMethod, ContractPaymentStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { contractError } from "./contracts.errors";

type Db = PrismaClient | Tx;

export const RENEWAL_COLLECTION_STATES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "OFFICE_UNPAID",
  "PAID",
  "COMPLETED_NO_CHARGE",
] as const;

export type RenewalCollectionState = (typeof RENEWAL_COLLECTION_STATES)[number];

export type RenewalStateInput = {
  additionalAmount: number;
  approvedAt: Date | null;
  appliedAt: Date | null;
  settledPaymentId: string | null;
};

export function deriveRenewalCollectionState(row: RenewalStateInput): RenewalCollectionState {
  if (row.additionalAmount <= 0) {
    return row.appliedAt ? "COMPLETED_NO_CHARGE" : "PENDING";
  }
  if (row.settledPaymentId) return "PAID";
  if (row.appliedAt) return "OFFICE_UNPAID";
  if (row.approvedAt) return "AWAITING_PAYMENT";
  return "PENDING";
}

/** Financial settlement for positive renewals requires a trusted collected payment. */
export function isRenewalFinanciallySettled(row: RenewalStateInput): boolean {
  if (row.additionalAmount <= 0) return Boolean(row.appliedAt);
  return Boolean(row.settledPaymentId);
}

export const OUTSTANDING_OFFICE_RENEWAL_FILTER = {
  additionalAmount: { gt: 0 },
  appliedAt: { not: null },
  settledPaymentId: null,
} as const;

export type OutstandingRenewalRow = {
  id: string;
  createdAt: Date;
  previousEndAt: Date;
  newEndAt: Date;
  additionalDays: number;
  additionalAmount: number;
};

export async function listOutstandingOfficeRenewals(
  db: Db,
  contractId: string,
): Promise<OutstandingRenewalRow[]> {
  return db.contractRenewal.findMany({
    where: { contractId, ...OUTSTANDING_OFFICE_RENEWAL_FILTER },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      previousEndAt: true,
      newEndAt: true,
      additionalDays: true,
      additionalAmount: true,
    },
  });
}

export async function assertNoOutstandingOfficeRenewals(db: Db, contractId: string): Promise<void> {
  const outstanding = await listOutstandingOfficeRenewals(db, contractId);
  if (outstanding.length === 0) return;
  throw contractError.renewalPaymentRequired(
    outstanding.map((row) => ({
      id: row.id,
      additionalDays: row.additionalDays,
      additionalAmount: row.additionalAmount,
      previousEndAt: row.previousEndAt.toISOString(),
      newEndAt: row.newEndAt.toISOString(),
    })),
  );
}

export function mapOutstandingRenewalRead(row: OutstandingRenewalRow) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    previousEndAt: row.previousEndAt,
    newEndAt: row.newEndAt,
    additionalDays: row.additionalDays,
    amount: row.additionalAmount,
    state: "OFFICE_UNPAID" as const,
  };
}

export function renewalCollectableStatuses(): readonly string[] {
  return ["ACTIVE", "RETOUT", "REVIEW"];
}

export type RenewalPaymentMeta = {
  paymentMethod: ContractPaymentMethod | null;
  paymentStatus: ContractPaymentStatus | null;
};
