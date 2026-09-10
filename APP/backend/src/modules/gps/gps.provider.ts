import { GpsUnconfiguredProvider } from "src/modules/gps/providers/gps-unconfigured.provider";
import type { GpsProvider } from "src/modules/gps/gps.types";

let override: GpsProvider | undefined;

/**
 * Test-only injection. Production/development always resolve
 * GpsUnconfiguredProvider until official vendor documentation exists.
 */
export function setGpsProviderForTests(provider: GpsProvider | undefined): void {
  override = provider;
}

/**
 * Provider selection. GPS_ENABLED must never conjure a configured provider.
 * When a real adapter exists, select it here from real credentials.
 */
export function createGpsProvider(): GpsProvider {
  if (override) return override;
  return new GpsUnconfiguredProvider();
}
