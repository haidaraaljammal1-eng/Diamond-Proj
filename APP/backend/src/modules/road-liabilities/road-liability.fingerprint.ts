import { createHash } from "node:crypto";
import type { RoadLiabilityType } from "@prisma/client";
import { GPS_CROSSING_DEDUP_MS } from "src/modules/road-liabilities/road-liability.constants";

/**
 * Conservative ingestion fingerprint. Distinct legitimate events must not merge.
 * When a provider supplies externalEventId, include it so retries collide and
 * unrelated events (different ids) never share a fingerprint.
 */
export function buildIngestionFingerprint(input: {
  sourceKey: string;
  eventType: RoadLiabilityType;
  externalEventId?: string | null;
  vehicleId?: number | null;
  plateNumberNormalized?: string | null;
  externalVehicleRef?: string | null;
  gateId?: string | null;
  externalReference?: string | null;
  occurredAt: Date;
  amount?: number | null;
}): string {
  const parts = [
    "v1",
    input.sourceKey,
    input.eventType,
    input.externalEventId?.trim() || "",
    input.vehicleId != null ? String(input.vehicleId) : "",
    input.plateNumberNormalized ?? "",
    input.externalVehicleRef ?? "",
    input.gateId ?? "",
    input.externalReference ?? "",
    input.occurredAt.toISOString(),
    input.amount != null ? String(input.amount) : "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** GPS prediction fingerprint uses a coarse time bucket so ingest retries of the same crossing collide. */
export function buildGpsInferenceFingerprint(input: {
  vehicleId: number;
  gateId: string;
  occurredAt: Date;
}): string {
  const bucket = Math.floor(input.occurredAt.getTime() / GPS_CROSSING_DEDUP_MS);
  const parts = ["v1", "GPS_INFERENCE", "SALIK_TOLL", String(input.vehicleId), input.gateId, String(bucket)];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
