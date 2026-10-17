/** Cost is missing only when null/undefined; explicit zero is valid. */
export function isMaintenanceCostMissing(cost: number | null | undefined): boolean {
  return cost == null;
}
