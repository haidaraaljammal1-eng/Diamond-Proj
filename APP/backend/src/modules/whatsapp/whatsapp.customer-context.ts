import type { ContractStatus } from "@prisma/client";

/** Possession / reservation — same set as vehicle currentRental blocking statuses. */
export const WHATSAPP_CUSTOMER_BLOCKING_CONTRACT_STATUSES: readonly ContractStatus[] = [
  "PAID",
  "ACTIVE",
  "RETOUT",
];

const STATUS_PRIORITY: Partial<Record<ContractStatus, number>> = {
  ACTIVE: 0,
  RETOUT: 1,
  PAID: 2,
};

export type WhatsAppCustomerContractRow = {
  id: string;
  contractNumber: string;
  status: ContractStatus;
  endAt: Date | null;
  vehicle: { vehicleName: string | null; plateNumber: string | null };
  company: { code: string; displayName: string };
};

export function pickActiveWhatsAppCustomerContract<T extends WhatsAppCustomerContractRow>(
  rows: T[],
): T | null {
  const blocking = rows.filter((row) =>
    (WHATSAPP_CUSTOMER_BLOCKING_CONTRACT_STATUSES as readonly string[]).includes(row.status),
  );
  if (blocking.length === 0) return null;
  return [...blocking].sort((a, b) => {
    const rankA = STATUS_PRIORITY[a.status] ?? 99;
    const rankB = STATUS_PRIORITY[b.status] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    const endA = a.endAt?.getTime() ?? 0;
    const endB = b.endAt?.getTime() ?? 0;
    return endB - endA;
  })[0]!;
}

export function pickLatestWhatsAppCustomerContract<T extends { createdAt: Date }>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
}
