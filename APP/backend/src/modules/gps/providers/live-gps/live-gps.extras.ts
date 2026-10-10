import { sanitizeGpsProviderExtras } from "src/modules/gps/gps-provider-extras";

const ALLOWED_KEYS = new Set([
  "dataAgeSeconds",
  "dataAgeMinutes",
  "providerStatusDurationSeconds",
  "providerStatusDurationText",
  "providerLastDays",
  "providerDeviceOnOff",
  "rawMotion",
  "rawActMotion",
  "rawIgnition",
  "rawActIgnition",
  "rawActSpeed",
  "rawFuel",
  "rawCharge",
  "rawBatteryLevel",
  "rawImmobilizeFlag",
  "snapshotReferenceIso",
]);

export function buildLiveGpsProviderExtras(
  fields: Record<string, unknown>,
): Record<string, unknown> | null {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    picked[key] = value;
  }
  return sanitizeGpsProviderExtras(picked);
}
