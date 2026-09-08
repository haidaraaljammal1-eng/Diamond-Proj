import type { ContractStatus, PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { CURRENT_RENTAL_STATUSES } from "src/modules/contracts/contracts.constants";

export type CurrentRentalDto = {
  contractId: string;
  customerName: string;
  endAt: Date;
  status: "paid" | "active" | "retout" | "review";
};

const STATUS_TO_DTO: Record<"PAID" | "ACTIVE" | "RETOUT" | "REVIEW", CurrentRentalDto["status"]> = {
  PAID: "paid",
  ACTIVE: "active",
  RETOUT: "retout",
  REVIEW: "review",
};

type SnapshotCustomer = { name?: unknown };

type DuplicateHandler = (info: {
  vehicleId: number;
  keptContractId: string;
  ignoredContractId: string;
}) => void;

function customerNameFromSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const customer = (snapshot as { customer?: SnapshotCustomer }).customer;
  return typeof customer?.name === "string" && customer.name.trim()
    ? customer.name.trim()
    : null;
}

function toCurrentRental(row: {
  id: string;
  status: ContractStatus;
  endAt: Date | null;
  createdAt: Date;
  rentalDays: number;
  snapshot: unknown;
  customer: { name: string } | null;
}): CurrentRentalDto | null {
  if (row.status !== "PAID" && row.status !== "ACTIVE" && row.status !== "RETOUT" && row.status !== "REVIEW") {
    return null;
  }
  const endAt =
    row.endAt ?? new Date(row.createdAt.getTime() + row.rentalDays * 86_400_000);
  const customerName =
    customerNameFromSnapshot(row.snapshot) ?? row.customer?.name ?? "Customer";
  return {
    contractId: row.id,
    customerName,
    endAt,
    status: STATUS_TO_DTO[row.status],
  };
}

/**
 * Batch-load currentRental for a page of vehicles — one query, no N+1.
 * currentRental is the current blocking rental context (PAID/ACTIVE/RETOUT/REVIEW),
 * not only a physically started rental.
 *
 * If corrupt data has more than one blocking contract per vehicle, the oldest
 * (`createdAt`, then `id`) wins and `onDuplicate` is invoked — never a random pick.
 */
export async function loadCurrentRentalsByVehicleIds(
  db: PrismaClient | Tx,
  vehicleIds: number[],
  options?: { onDuplicate?: DuplicateHandler },
): Promise<Map<number, CurrentRentalDto>> {
  const map = new Map<number, CurrentRentalDto>();
  if (vehicleIds.length === 0) return map;

  const rows = await db.contract.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      status: { in: [...CURRENT_RENTAL_STATUSES] },
    },
    select: {
      id: true,
      vehicleId: true,
      status: true,
      endAt: true,
      createdAt: true,
      rentalDays: true,
      snapshot: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const row of rows) {
    const dto = toCurrentRental(row);
    if (!dto) continue;
    const existing = map.get(row.vehicleId);
    if (existing) {
      options?.onDuplicate?.({
        vehicleId: row.vehicleId,
        keptContractId: existing.contractId,
        ignoredContractId: row.id,
      });
      continue;
    }
    map.set(row.vehicleId, dto);
  }
  return map;
}
