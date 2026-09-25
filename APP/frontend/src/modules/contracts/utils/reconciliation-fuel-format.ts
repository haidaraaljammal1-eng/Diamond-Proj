import type { FuelLevel } from "../types/contract.types.ts";
import { FUEL_LEVELS } from "../constants/inspection.ts";

/** Maps stored fuel level to eighths remaining (F → 8, E → 0). */
export function fuelLevelToEighths(value: string | null | undefined): number | null {
  if (!value) return null;
  const index = FUEL_LEVELS.indexOf(value as FuelLevel);
  if (index < 0) return null;
  return 8 - index;
}

/** Display fuel as x/8 inside Final Reconciliation (F → 8/8, 1/2 → 4/8, …). */
export function formatFuelLevelEighths(value: string | null | undefined): string {
  const eighths = fuelLevelToEighths(value);
  if (eighths == null) return "—";
  return `${eighths}/8`;
}

/** Display backend fuelDifference (eighth-index delta) as signed x/8. */
export function formatFuelDifferenceEighths(difference: number | null | undefined): string {
  if (difference == null) return "—";
  const sign = difference > 0 ? "+" : "";
  return `${sign}${difference}/8`;
}
