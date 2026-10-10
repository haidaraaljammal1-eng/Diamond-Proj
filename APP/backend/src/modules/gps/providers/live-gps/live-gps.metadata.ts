import { asString, isRecord } from "src/modules/gps/providers/live-gps/live-gps.parse";

export function mapLiveGpsDeviceMetadata(
  rows: unknown[],
  externalDeviceId: string,
): { deviceModel: string | null } {
  for (const row of rows) {
    if (!isRecord(row) || asString(row.deviceid) !== externalDeviceId) continue;
    const deviceModel = asString(row.devicetype);
    return { deviceModel: deviceModel?.trim() || null };
  }
  return { deviceModel: null };
}
