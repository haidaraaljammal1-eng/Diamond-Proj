/** The only visible DEV controls substitute unavailable external providers. */
export function isProviderSimulationEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_DIAMOND_SIMULATION,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production" && flag === "true";
}

/** Retired general workflow simulation stays disabled for legacy consumers. */
export function isDemoSimulationEnabled(_flag?: string, _nodeEnv?: string): boolean {
  void _flag;
  void _nodeEnv;
  return false;
}
