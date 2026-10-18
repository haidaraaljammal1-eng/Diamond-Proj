/** Retired — provider simulation must not substitute production rental flows. */
export function isProviderSimulationEnabled(
  _flag?: string,
  _nodeEnv?: string,
): boolean {
  void _flag;
  void _nodeEnv;
  return false;
}

/** Retired — browser fixture overlays removed; staff surfaces use backend APIs only. */
export function isUiDemoSimulationEnabled(
  _surface: "dashboard" | "whatsapp" | "roadLiabilities" | "notifications",
  _flag?: string,
  _nodeEnv?: string,
): boolean {
  void _surface;
  void _flag;
  void _nodeEnv;
  return false;
}

/** Retired general workflow simulation remains disabled for other consumers. */
export function isDemoSimulationEnabled(_flag?: string, _nodeEnv?: string): boolean {
  void _flag;
  void _nodeEnv;
  return false;
}
