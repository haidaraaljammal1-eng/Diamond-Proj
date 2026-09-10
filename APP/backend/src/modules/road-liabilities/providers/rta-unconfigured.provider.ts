import type { RoadLiabilityProvider } from "src/modules/road-liabilities/road-liability.types";

/**
 * Fail-closed RTA provider — the only RTA provider that exists today.
 * No network calls. No fabricated violations, amounts, or vehicle refs.
 */
export class RtaUnconfiguredProvider implements RoadLiabilityProvider {
  readonly name = "RTA";
  readonly configured = false;
}
