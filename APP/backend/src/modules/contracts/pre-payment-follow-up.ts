import type { ContractStatus, PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

export type PrePaymentFollowUpDto = {
  contractId: string;
  contractNumber: string;
  status: "awaiting" | "form" | "signed";
  customerName: string | null;
};

const PRE_PAYMENT_STATUSES: ContractStatus[] = ["AWAITING", "FORM", "SIGNED"];

const STATUS_TO_DTO: Record<"AWAITING" | "FORM" | "SIGNED", PrePaymentFollowUpDto["status"]> = {
  AWAITING: "awaiting",
  FORM: "form",
  SIGNED: "signed",
};

type Db = PrismaClient | Tx;

/** Active customer RENTAL link: issued, not revoked, not consumed, not expired. */
export function usableRentalContractLinkWhere(now: Date = new Date()) {
  return {
    type: "RENTAL" as const,
    revokedAt: null,
    usedAt: null,
    expiresAt: { gt: now },
  };
}

/**
 * Pre-payment staff follow-up: AWAITING/FORM/SIGNED with a usable RENTAL link.
 * Does not imply vehicle reservation.
 */
export async function loadPrePaymentFollowUpsByVehicleIds(
  db: Db,
  vehicleIds: number[],
): Promise<Map<number, PrePaymentFollowUpDto[]>> {
  const map = new Map<number, PrePaymentFollowUpDto[]>();
  if (vehicleIds.length === 0) return map;
  const now = new Date();

  const rows = await db.contract.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      status: { in: PRE_PAYMENT_STATUSES },
      links: { some: usableRentalContractLinkWhere(now) },
    },
    select: {
      id: true,
      contractNumber: true,
      vehicleId: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const row of rows) {
    if (row.status !== "AWAITING" && row.status !== "FORM" && row.status !== "SIGNED") {
      continue;
    }
    const list = map.get(row.vehicleId) ?? [];
    list.push({
      contractId: row.id,
      contractNumber: row.contractNumber,
      status: STATUS_TO_DTO[row.status],
      customerName: row.customer?.name?.trim() ? row.customer.name : null,
    });
    map.set(row.vehicleId, list);
  }

  return map;
}
