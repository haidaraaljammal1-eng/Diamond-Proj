import type { BetterDirection } from "src/modules/reports/kpi-catalog";

/**
 * Pure metric formula registry — unit-tested, reused across every report so a KPI
 * is never computed two different ways. Rates are FRACTIONS (0..1). `null` means
 * "no data" (never a fabricated value).
 */

/** Average duration in hours (null when empty). */
export function avgHours(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  return round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / 3_600_000, 2);
}

/** Average of a numeric sample (null when empty). */
export function avgOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length, 2);
}

export type TargetStatus = "ACHIEVED" | "NEAR_TARGET" | "BELOW_TARGET" | "UNAVAILABLE";

/** Target status. `nearBand` is the tolerance fraction (default 5%). */
export function targetStatus(value: number | null, target: number | null, direction: BetterDirection, nearBand = 0.05): TargetStatus {
  if (value == null || target == null) return "UNAVAILABLE";
  if (direction === "HIGHER_BETTER") {
    if (value >= target) return "ACHIEVED";
    if (value >= target * (1 - nearBand)) return "NEAR_TARGET";
    return "BELOW_TARGET";
  }
  if (value <= target) return "ACHIEVED";
  if (value <= target * (1 + nearBand)) return "NEAR_TARGET";
  return "BELOW_TARGET";
}

export type ChangeDirection = "UP" | "DOWN" | "FLAT";
export function change(current: number | null, previous: number | null): { change: number | null; changeDirection: ChangeDirection } {
  if (current == null || previous == null) return { change: null, changeDirection: "FLAT" };
  const diff = round(current - previous, 4);
  return { change: diff, changeDirection: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT" };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
