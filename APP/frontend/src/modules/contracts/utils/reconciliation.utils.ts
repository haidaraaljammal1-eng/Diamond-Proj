import type {
  FullReconciliationReadDto,
  ReconciliationImagePairDto,
  ReconciliationLineDto,
  ReconciliationPreviewImage,
  ReconciliationRoadLiabilityType,
  ReconciliationTotalsDto,
} from "../types/reconciliation.types";

export function isReconciliationEditable(data: FullReconciliationReadDto): boolean {
  if (data.contract.status !== "REVIEW") return false;
  const { reconciliation } = data;
  return !reconciliation.finalizedAt && !reconciliation.settled;
}

export function canCollectReconciliation(data: FullReconciliationReadDto): boolean {
  if (data.contract.status !== "REVIEW") return false;
  if (data.reconciliation.settled) return false;
  return data.totals.finalAmount > 0;
}

export function isReconciliationAwaitingPayment(data: FullReconciliationReadDto): boolean {
  const { reconciliation, totals } = data;
  return Boolean(
    reconciliation.finalizedAt &&
      !reconciliation.settled &&
      totals.finalAmount > 0,
  );
}

export function isReconciliationPaymentPending(data: FullReconciliationReadDto): boolean {
  const status = data.collection.paymentStatus;
  return status === "PENDING" || status === "PROCESSING";
}

export function isReconciliationPaymentFailed(data: FullReconciliationReadDto): boolean {
  const status = data.collection.paymentStatus;
  return status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
}

export function damageLines(lines: ReconciliationLineDto[]): ReconciliationLineDto[] {
  return lines.filter((line) => line.type === "DAMAGE");
}

export function fuelLines(lines: ReconciliationLineDto[]): ReconciliationLineDto[] {
  return lines.filter((line) => line.type === "FUEL");
}

export function manualChargeLines(lines: ReconciliationLineDto[]): ReconciliationLineDto[] {
  return lines.filter((line) => line.type === "DAMAGE" || line.type === "FUEL");
}

export function flattenImagePairs(pairs: ReconciliationImagePairDto[]): ReconciliationPreviewImage[] {
  const images: ReconciliationPreviewImage[] = [];
  for (const pair of pairs) {
    if (pair.outPhoto) {
      images.push({
        id: pair.outPhoto.id,
        url: pair.outPhoto.url,
        angle: pair.angle,
        stage: "OUT",
      });
    }
    if (pair.inPhoto) {
      images.push({
        id: pair.inPhoto.id,
        url: pair.inPhoto.url,
        angle: pair.angle,
        stage: "IN",
      });
    }
  }
  return images;
}

export function roadLiabilityTypeKey(type: ReconciliationRoadLiabilityType): string {
  if (type === "RTA_VIOLATION") return "trafficViolation";
  return "salik";
}

export function totalsEntries(
  totals: ReconciliationTotalsDto,
): Array<{ key: keyof ReconciliationTotalsDto; amount: number }> {
  const keys: Array<keyof ReconciliationTotalsDto> = [
    "damages",
    "fuel",
    "late",
    "other",
    "salik",
    "violations",
  ];
  return keys
    .map((key) => ({ key, amount: totals[key] }))
    .filter((entry) => entry.amount > 0);
}

export function custodyAngleLabelKey(angle: string): string {
  return `carOut.angle.${angle}`;
}
