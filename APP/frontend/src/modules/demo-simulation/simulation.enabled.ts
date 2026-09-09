/** Dedicated presentation switch. Never inferred from NODE_ENV alone. */
export function isDemoSimulationEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_DEMO_SIMULATION_ENABLED,
): boolean {
  return flag === "true";
}

/** Simulation mutations stay on the client. Real rental/payment APIs must not run. */
export function shouldSkipRentalMutation(simulationActive: boolean): boolean {
  return simulationActive;
}
