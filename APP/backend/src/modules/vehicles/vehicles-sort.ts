import type { Prisma } from "@prisma/client";
import type { SortDirection } from "src/lib/http/pagination";

const TIE_BREAKER: Prisma.VehicleOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/**
 * Fleet list ordering with deterministic tie-breaking and explicit null
 * placement for rate/year fields (0 sorts before positive; nulls group with
 * the low end on ASC and the high end on DESC).
 */
export function buildVehicleListOrderBy(
  field: string,
  direction: SortDirection,
): Prisma.VehicleOrderByWithRelationInput[] {
  if (field === "dailyRate" || field === "monthlyRate" || field === "modelYear") {
    const nulls = direction === "asc" ? "first" : "last";
    return [
      { [field]: { sort: direction, nulls } },
      ...TIE_BREAKER,
    ] as Prisma.VehicleOrderByWithRelationInput[];
  }

  if (field === "plateNumber" || field === "vin") {
    const nulls = direction === "asc" ? "last" : "first";
    return [
      { [field]: { sort: direction, nulls } },
      ...TIE_BREAKER,
    ] as Prisma.VehicleOrderByWithRelationInput[];
  }

  return [{ [field]: direction }, ...TIE_BREAKER] as Prisma.VehicleOrderByWithRelationInput[];
}
