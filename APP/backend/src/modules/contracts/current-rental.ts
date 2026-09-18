import type { ContractStatus, PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { CURRENT_RENTAL_STATUSES } from "src/modules/contracts/contracts.constants";

export type CurrentRentalDto = {
  contractId: string;
  contractNumber: string;
  customerName: string;
  startAt: Date | null;
  endAt: Date;
  status: "paid" | "active" | "retout";
  awaitingHandover: boolean;
};

const STATUS_TO_DTO: Record<"PAID" | "ACTIVE" | "RETOUT", CurrentRentalDto["status"]> = {
  PAID: "paid",
  ACTIVE: "active",
  RETOUT: "retout",
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
  contractNumber: string;
  status: ContractStatus;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  rentalDays: number;
  snapshot: unknown;
  customer: { name: string } | null;
  carOut: { id: string } | null;
}): CurrentRentalDto | null {
  if (row.status !== "PAID" && row.status !== "ACTIVE" && row.status !== "RETOUT") {
    return null;
  }
  const endAt =
    row.endAt ?? new Date(row.createdAt.getTime() + row.rentalDays * 86_400_000);
  const customerName =
    customerNameFromSnapshot(row.snapshot) ?? row.customer?.name ?? "Customer";
  return {
    contractId: row.id,
    contractNumber: row.contractNumber,
    customerName,
    startAt: row.startAt,
    endAt,
    status: STATUS_TO_DTO[row.status],
    awaitingHandover: row.status === "PAID" && row.carOut === null,
  };
}

/**
 * Batch-load currentRental for a page of vehicles — one query, no N+1.
 * currentRental is the current blocking rental context (PAID/ACTIVE/RETOUT),
 * not only a physically started rental. REVIEW after Car-In is not possession.
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
      contractNumber: true,
      vehicleId: true,
      status: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      rentalDays: true,
      snapshot: true,
      customer: { select: { name: true } },
      carOut: { select: { id: true } },
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
