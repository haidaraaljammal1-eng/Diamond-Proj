import type { ProviderNormalizedSnapshot } from "src/modules/gps/gps-provider.types";
import type { NormalizedGpsPositionInput } from "src/modules/gps/gps.types";

/** Maps provider-neutral snapshot (post Live GPS mapper) to ingest input. */
export function providerSnapshotToIngestInput(
  snapshot: ProviderNormalizedSnapshot,
  vehicleId: number,
): NormalizedGpsPositionInput {
  const t = snapshot.telemetry;
  if (!t) {
    throw new Error("SNAPSHOT_MISSING_TELEMETRY");
  }
  return {
    vehicleId,
    capturedAt: t.capturedAt,
    receivedAt: t.receivedAt,
    latitude: t.latitude,
    longitude: t.longitude,
    speedKph: t.speedKph,
    headingDegrees: t.headingDegrees,
    sourceEventId: t.sourceEventId,
    previousLatitude: t.previousLatitude,
    previousLongitude: t.previousLongitude,
    ignitionOn: t.ignitionOn,
    providerDeviceState: t.providerDeviceState,
    addressLine: t.addressLine,
    satelliteCount: t.satelliteCount,
    parkingEnabled: t.parkingEnabled,
    odometerValue: t.odometerValue,
    odometerUnit: t.odometerUnit,
    distanceTodayValue: t.distanceTodayValue,
    distanceTodayUnit: t.distanceTodayUnit,
    providerExtras: t.providerExtras,
  };
}
