import { createHash } from "node:crypto";

function canonCoord(value: number): string {
  return value.toFixed(7);
}

/**
 * Diamond-generated idempotency key — NOT an official Live GPS event id.
 */
export function buildLiveGpsSourceEventId(input: {
  providerAccountId: string;
  externalDeviceId: string;
  capturedAt: Date;
  latitude: number;
  longitude: number;
}): string {
  const payload = [
    "LIVE_GPS",
    input.providerAccountId,
    input.externalDeviceId,
    input.capturedAt.toISOString(),
    canonCoord(input.latitude),
    canonCoord(input.longitude),
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
