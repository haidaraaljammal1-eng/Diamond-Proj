import { TarsUnconfiguredProvider } from "src/modules/integrations/tars/providers/tars-unconfigured.provider";
import type { TarsProvider } from "src/modules/integrations/tars/tars.types";

let override: TarsProvider | undefined;

/**
 * Test-only injection point (mirrors the payment/OCR provider factories).
 * Production and development runtime always resolve TarsUnconfiguredProvider.
 */
export function setTarsProviderForTests(provider: TarsProvider | undefined): void {
  override = provider;
}

/**
 * Provider selection. There is intentionally no branch on TARS_ENABLED: an
 * operator flag must never conjure a configured provider. When official TARS
 * documentation arrives, add `TarsApiProvider` and select it here from real
 * credentials — nothing else in Diamond has to change.
 */
export function createTarsProvider(): TarsProvider {
  if (override) return override;
  return new TarsUnconfiguredProvider();
}
