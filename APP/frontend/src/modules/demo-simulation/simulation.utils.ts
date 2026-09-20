import type { ContractTarsStateDto } from "@/modules/contracts/types/tars.types";
import { DEMO_TARS_PRESETS } from "./simulation.fixtures";
import type { SimulatedTarsPreset } from "./simulation.types";

/** Retained for compatibility with the read-only TARS status presentation. */
export function applyTarsSimulation(
  real: ContractTarsStateDto | null,
  preset: SimulatedTarsPreset | null,
): ContractTarsStateDto | null {
  if (!preset) return real;
  // The routing company stays authoritative: a simulated preset never decides
  // whether a Contract belongs to UNIQUE TARS or ELITE TARS.
  if (!real) return null;
  return { ...DEMO_TARS_PRESETS[preset], company: real.company };
}
