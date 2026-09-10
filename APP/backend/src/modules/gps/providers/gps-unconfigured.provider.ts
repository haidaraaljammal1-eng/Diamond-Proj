import type { GpsProvider } from "src/modules/gps/gps.types";

/**
 * Fail-closed GPS provider — the only provider that exists today.
 *
 * No network calls. No fabricated coordinates, speed, heading, or device ids.
 */
export class GpsUnconfiguredProvider implements GpsProvider {
  readonly name = "none";
  readonly configured = false;
}
