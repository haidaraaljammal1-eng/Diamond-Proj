import type { ContractReconciliationLineType, RoadLiabilityType } from "@prisma/client";

/** Stored on RoadLiability-backed reconciliation lines. */
export const ROAD_LIABILITY_RECON_SOURCE_DOMAIN = "road_liability";

/** New manual lines of these types must originate from a confirmed RoadLiability. */
export const MANUAL_EXTERNAL_RECON_LINE_TYPES = ["SALIK", "VIOLATION"] as const;

export function isManualExternalReconLineType(type: string): boolean {
  return (MANUAL_EXTERNAL_RECON_LINE_TYPES as readonly string[]).includes(type);
}

export function mapRoadLiabilityTypeToReconLineType(
  type: RoadLiabilityType,
): ContractReconciliationLineType {
  if (type === "SALIK_TOLL") return "SALIK";
  return "VIOLATION";
}

export function roadLiabilityReconDescription(type: RoadLiabilityType): string {
  switch (type) {
    case "RTA_VIOLATION":
      return "RTA traffic violation";
    case "SALIK_TOLL":
      return "Salik toll";
    case "SALIK_VIOLATION":
      return "Salik violation";
  }
}

export function reconciliationTotalsFromLines(
  lines: ReadonlyArray<{ amount: number }>,
): {
  chargesTotal: number;
  finalAmount: number;
} {
  const chargesTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    chargesTotal,
    finalAmount: chargesTotal,
  };
}

export type CustomerChargeAdjustment =
  | {
      ok: true;
      officialAmount: number;
      customerChargeAmount: number;
      adjustmentAmount: number;
      adjustmentReason: string | null;
    }
  | { ok: false; reason: "INVALID_CUSTOMER_CHARGE" | "CUSTOMER_CHARGE_BELOW_OFFICIAL" | "ADJUSTMENT_REASON_REQUIRED" };

/**
 * Server-derived adjustment. Never trust a frontend-supplied delta.
 * Whole AED integers only.
 */
export function deriveCustomerChargeAdjustment(input: {
  officialAmount: number;
  customerChargeAmount: number;
  adjustmentReason?: string | null;
}): CustomerChargeAdjustment {
  const officialAmount = input.officialAmount;
  const customerChargeAmount = input.customerChargeAmount;
  if (!Number.isInteger(officialAmount) || officialAmount <= 0) {
    return { ok: false, reason: "INVALID_CUSTOMER_CHARGE" };
  }
  if (!Number.isInteger(customerChargeAmount) || customerChargeAmount <= 0) {
    return { ok: false, reason: "INVALID_CUSTOMER_CHARGE" };
  }
  if (customerChargeAmount < officialAmount) {
    return { ok: false, reason: "CUSTOMER_CHARGE_BELOW_OFFICIAL" };
  }
  const adjustmentAmount = customerChargeAmount - officialAmount;
  if (adjustmentAmount === 0) {
    return { ok: true, officialAmount, customerChargeAmount, adjustmentAmount: 0, adjustmentReason: null };
  }
  const reason = input.adjustmentReason?.trim() ?? "";
  if (!reason || reason.length > 200) {
    return { ok: false, reason: "ADJUSTMENT_REASON_REQUIRED" };
  }
  return { ok: true, officialAmount, customerChargeAmount, adjustmentAmount, adjustmentReason: reason };
}
