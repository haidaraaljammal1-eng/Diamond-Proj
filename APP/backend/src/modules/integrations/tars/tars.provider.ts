import { TarsUnconfiguredProvider } from "src/modules/integrations/tars/providers/tars-unconfigured.provider";
import type { TarsProvider } from "src/modules/integrations/tars/tars.types";

let override: TarsProvider | undefined;
let lastRequestedCompanyCode: string | null = null;

/**
 * Test-only injection point (mirrors the payment/OCR provider factories).
 * Production and development runtime always resolve TarsUnconfiguredProvider.
 */
export function setTarsProviderForTests(provider: TarsProvider | undefined): void {
  override = provider;
  lastRequestedCompanyCode = null;
}

/** Test-only: the company code the last provider resolution routed for. */
export function lastTarsProviderCompanyCode(): string | null {
  return lastRequestedCompanyCode;
}

/**
 * Provider selection for one operating company. There is intentionally no branch
 * on TARS_ENABLED: an operator flag must never conjure a configured provider.
 * When official TARS documentation arrives, add `TarsApiProvider` and select it
 * here from that company's real credentials — nothing else in Diamond changes.
 *
 * The company code always comes from `Contract.companyId` (historical ownership),
 * never from the Vehicle's current company or from a request parameter.
 */
export function createTarsProvider(companyCode: string): TarsProvider {
  lastRequestedCompanyCode = companyCode;
  if (override) return override;
  // Future: if getTarsCompanyConfig(companyCode).credentialsShellPresent → TarsApiProvider
  return new TarsUnconfiguredProvider(companyCode);
}
