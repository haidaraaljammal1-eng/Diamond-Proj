import type { RoadLiabilityType, StaffRoadChargeCategory } from "@prisma/client";

/** Trim surrounding whitespace only; preserve leading zeros and interior characters. */
export function normalizeRoadChargeReferenceNumber(referenceNumber: string): string {
  return referenceNumber.trim();
}

export function roadLiabilityTypeToChargeCategory(
  type: RoadLiabilityType,
): StaffRoadChargeCategory | null {
  if (type === "RTA_VIOLATION") return "TRAFFIC_VIOLATION";
  if (type === "SALIK_TOLL" || type === "SALIK_VIOLATION") return "SALIK";
  return null;
}
