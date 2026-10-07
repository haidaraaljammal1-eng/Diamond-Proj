import type { ContractReconciliationLineType, RoadLiabilityType } from "@prisma/client";
import type { InvoiceLineType } from "@prisma/client";

export function reconciliationLineToInvoiceLineType(
  type: ContractReconciliationLineType,
): InvoiceLineType {
  switch (type) {
    case "DAMAGE":
      return "RECONCILIATION_DAMAGE";
    case "FUEL":
      return "RECONCILIATION_FUEL";
    case "LATE":
      return "RECONCILIATION_LATE";
    default:
      return "RECONCILIATION_OTHER";
  }
}

export function reconciliationServiceLabel(type: ContractReconciliationLineType): string {
  switch (type) {
    case "DAMAGE":
      return "Vehicle Damage";
    case "FUEL":
      return "Fuel Charge";
    case "LATE":
      return "Late Return Charge";
    case "SALIK":
      return "Salik";
    case "VIOLATION":
      return "Traffic Fines";
    default:
      return "Other Charge";
  }
}

export function roadLiabilityToInvoiceLineType(type: RoadLiabilityType): InvoiceLineType {
  switch (type) {
    case "RTA_VIOLATION":
      return "ROAD_LIABILITY_TRAFFIC";
    case "SALIK_TOLL":
    case "SALIK_VIOLATION":
      return "ROAD_LIABILITY_SALIK";
    default:
      return "ROAD_LIABILITY_OTHER";
  }
}

export function roadLiabilityServiceLabel(type: RoadLiabilityType): string {
  switch (type) {
    case "RTA_VIOLATION":
      return "Traffic Fines";
    case "SALIK_TOLL":
      return "Salik";
    case "SALIK_VIOLATION":
      return "Salik Violation";
    default:
      return "Road Charge";
  }
}
