import type { ContractTarsStateDto } from "@/modules/contracts/types/tars.types";
import { DEMO_TARS_PRESETS } from "./simulation.fixtures";
import type { SimulatedTarsPreset } from "./simulation.types";

/** Retained for compatibility with the read-only TARS status presentation. */
export function applyTarsSimulation(
  real: ContractTarsStateDto | null,
  preset: SimulatedTarsPreset | null,
): ContractTarsStateDto | null {
  return preset ? DEMO_TARS_PRESETS[preset] : real;
}
