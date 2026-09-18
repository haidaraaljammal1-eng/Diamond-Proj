import type { SimulationSurface } from "../../simulation.types";

/** Retired broad simulation control; kept as an inert compatibility component. */
export function SimulationButton(_props: { surface: SimulationSurface; onGpsSimulate?: () => void; onViolationsSimulate?: () => void; onFinanceSimulate?: () => void; onFinanceReset?: () => void; onFinanceDisable?: () => void }) {
  void _props;
  return null;
}
