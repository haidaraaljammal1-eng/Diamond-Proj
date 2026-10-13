import type { CurrentRentalDto } from "src/modules/contracts/current-rental";
import type { PrePaymentFollowUpDto } from "src/modules/contracts/pre-payment-follow-up";
import type { SortDirection } from "src/lib/http/pagination";

/** Fields used for fleet attention tiering — matches public Vehicle card rental shape. */
export type FleetAttentionCurrentRental = Pick<
  CurrentRentalDto,
  "status" | "awaitingHandover"
>;

export type FleetAttentionTier = "handover" | "urgent_follow_up" | null;

export type FleetSortRow = {
  id: number;
  createdAt: Date;
  dailyRate: number | null;
  monthlyRate: number | null;
  modelYear: number | null;
  plateNumber: string | null;
  vin: string | null;
  operationalStatus: "AVAILABLE" | "RENTED" | "SERVICE";
  isActive: boolean;
};

const TIER_RANK: Record<"handover" | "urgent_follow_up" | "standard", number> = {
  handover: 0,
  urgent_follow_up: 1,
  standard: 2,
};

export function resolveFleetAttentionTier(
  row: Pick<FleetSortRow, "operationalStatus" | "isActive">,
  currentRental: FleetAttentionCurrentRental | null,
  followUps: PrePaymentFollowUpDto[] | undefined,
): FleetAttentionTier {
  if (!row.isActive) return null;
  if (row.operationalStatus !== "AVAILABLE") return null;

  if (
    currentRental?.status === "paid" &&
    currentRental.awaitingHandover
  ) {
    return "handover";
  }

  if (!currentRental && followUps && followUps.length > 0) {
    return "urgent_follow_up";
  }

  return null;
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  const av = a ?? (direction === "asc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
  const bv = b ?? (direction === "asc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
  if (av === bv) return 0;
  return direction === "asc" ? av - bv : bv - av;
}

function compareNullableString(
  a: string | null,
  b: string | null,
  direction: SortDirection,
): number {
  const av = a ?? "";
  const bv = b ?? "";
  const cmp = av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true });
  return direction === "asc" ? cmp : -cmp;
}

function compareUserSort(a: FleetSortRow, b: FleetSortRow, field: string, direction: SortDirection): number {
  switch (field) {
    case "dailyRate":
      return compareNullableNumber(a.dailyRate, b.dailyRate, direction);
    case "monthlyRate":
      return compareNullableNumber(a.monthlyRate, b.monthlyRate, direction);
    case "modelYear":
      return compareNullableNumber(a.modelYear, b.modelYear, direction);
    case "plateNumber":
      return compareNullableString(a.plateNumber, b.plateNumber, direction);
    case "vin":
      return compareNullableString(a.vin, b.vin, direction);
    case "operationalStatus":
      return compareNullableString(a.operationalStatus, b.operationalStatus, direction);
    case "isActive":
      return direction === "asc" ? Number(a.isActive) - Number(b.isActive) : Number(b.isActive) - Number(a.isActive);
    case "createdAt":
    default:
      return direction === "asc"
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime();
  }
}

/**
 * Global fleet ordering: attention tier (handover, then urgent) before user sort.
 */
export function sortFleetVehicleIds(
  rows: FleetSortRow[],
  rentals: Map<number, FleetAttentionCurrentRental>,
  followUps: Map<number, PrePaymentFollowUpDto[]>,
  field: string,
  direction: SortDirection,
): number[] {
  const decorated = rows.map((row) => {
    const rental = rentals.get(row.id) ?? null;
    const tier = resolveFleetAttentionTier(row, rental, followUps.get(row.id));
    const rank = tier ? TIER_RANK[tier] : TIER_RANK.standard;
    return { row, rank, tier };
  });

  decorated.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    const userCmp = compareUserSort(left.row, right.row, field, direction);
    if (userCmp !== 0) return userCmp;
    if (left.row.createdAt.getTime() !== right.row.createdAt.getTime()) {
      return right.row.createdAt.getTime() - left.row.createdAt.getTime();
    }
    return right.row.id - left.row.id;
  });

  return decorated.map((entry) => entry.row.id);
}
