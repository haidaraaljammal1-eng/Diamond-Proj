import type { SimulatedGpsOverlay } from "@/modules/gps/utils/gps-simulation";
import type { SimulatedRoadLiabilitiesOverlay } from "@/modules/road-liabilities/utils/road-liability-simulation";
import type { FinanceSimulationOverlay } from "@/modules/finance/utils/finance-simulation";

/** Compatibility types for presentation overlays in unrelated modules. */
export type SimulatedTarsPreset = "notStarted" | "syncing" | "synced" | "partialFailure";
export type SimulationSurface = "license" | "passport" | "contract" | "payment" | "tars" | "gps" | "violations" | "finance";

export interface SimulationSnapshot {
  active: boolean;
  generation: number;
  tarsPreset: SimulatedTarsPreset | null;
  gpsOverlay: SimulatedGpsOverlay | null;
  roadLiabilitiesOverlay: SimulatedRoadLiabilitiesOverlay | null;
  financeOverlay: FinanceSimulationOverlay | null;
}
