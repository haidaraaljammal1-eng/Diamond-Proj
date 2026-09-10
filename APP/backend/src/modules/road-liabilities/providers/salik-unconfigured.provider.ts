import type { RoadLiabilityProvider } from "src/modules/road-liabilities/road-liability.types";

/**
 * Fail-closed Salik provider — the only Salik provider that exists today.
 * No network calls. No fabricated tolls, violations, or amounts.
 */
export class SalikUnconfiguredProvider implements RoadLiabilityProvider {
  readonly name = "SALIK";
  readonly configured = false;
}
