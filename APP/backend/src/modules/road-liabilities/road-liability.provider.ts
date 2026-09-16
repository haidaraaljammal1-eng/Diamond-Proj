import { RtaUnconfiguredProvider } from "src/modules/road-liabilities/providers/rta-unconfigured.provider";
import { SalikUnconfiguredProvider } from "src/modules/road-liabilities/providers/salik-unconfigured.provider";
import type { RoadLiabilityProvider } from "src/modules/road-liabilities/road-liability.types";

let rtaOverride: RoadLiabilityProvider | undefined;
let salikOverride: RoadLiabilityProvider | undefined;

/** Test-only injection. Production/development always resolve unconfigured providers. */
export function setRtaProviderForTests(provider: RoadLiabilityProvider | undefined): void {
  rtaOverride = provider;
}

export function setSalikProviderForTests(provider: RoadLiabilityProvider | undefined): void {
  salikOverride = provider;
}

/**
 * Provider selection. Do not conjure a configured provider from guessed env vars.
 * When a real adapter exists, select it here from official credentials.
 */
export function createRtaProvider(): RoadLiabilityProvider {
  if (rtaOverride) return rtaOverride;
  return new RtaUnconfiguredProvider();
}

export function createSalikProvider(): RoadLiabilityProvider {
  if (salikOverride) return salikOverride;
  return new SalikUnconfiguredProvider();
}
