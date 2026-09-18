/** Rental provider substitutes write to a real development Contract. */
export function isProviderSimulationEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_DIAMOND_SIMULATION,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production" && flag === "true";
}

/** Explicit browser-only demo surfaces. This flag never enables rental mutations. */
export function isUiDemoSimulationEnabled(
  surface: "dashboard" | "whatsapp" | "roadLiabilities",
  flag: string | undefined = process.env.NEXT_PUBLIC_DEMO_SIMULATION_ENABLED,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return (
    (surface === "dashboard" || surface === "whatsapp" || surface === "roadLiabilities") &&
    nodeEnv !== "production" &&
    flag === "true"
  );
}

/** Retired general workflow simulation remains disabled for other consumers. */
export function isDemoSimulationEnabled(_flag?: string, _nodeEnv?: string): boolean {
  void _flag;
  void _nodeEnv;
  return false;
}
