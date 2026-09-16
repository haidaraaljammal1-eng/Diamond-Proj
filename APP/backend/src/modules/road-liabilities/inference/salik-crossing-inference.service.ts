import type { FastifyInstance } from "fastify";
import type { GpsAcceptedPositionEvent } from "src/modules/gps/gps.types";
import { TOLL_NETWORK_SALIK } from "src/modules/road-liabilities/road-liability.constants";
import { createRoadLiabilityService } from "src/modules/road-liabilities/road-liability.service";
import {
  detectFirstCrossing,
  type GateGeometry,
} from "src/modules/road-liabilities/inference/salik-crossing-detector";

function toGateGeometry(row: {
  id: string;
  nameEn: string;
  nameAr: string;
  lineStartLatitude: { toNumber(): number } | number;
  lineStartLongitude: { toNumber(): number } | number;
  lineEndLatitude: { toNumber(): number } | number;
  lineEndLongitude: { toNumber(): number } | number;
  corridorMeters: { toNumber(): number } | number;
  allowedHeadingDegrees: { toNumber(): number } | number | null;
  headingToleranceDegrees: { toNumber(): number } | number | null;
}): GateGeometry {
  const num = (value: { toNumber(): number } | number | null): number | null => {
    if (value == null) return null;
    return typeof value === "number" ? value : value.toNumber();
  };
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    lineStartLatitude: num(row.lineStartLatitude) ?? 0,
    lineStartLongitude: num(row.lineStartLongitude) ?? 0,
    lineEndLatitude: num(row.lineEndLatitude) ?? 0,
    lineEndLongitude: num(row.lineEndLongitude) ?? 0,
    corridorMeters: num(row.corridorMeters) ?? 0,
    allowedHeadingDegrees: num(row.allowedHeadingDegrees),
    headingToleranceDegrees: num(row.headingToleranceDegrees),
  };
}

/**
 * GPS position observer: geometry is in-memory; persistence is a short independent
 * ingest transaction. Failures never affect GPS latest-state.
 */
export function createSalikCrossingInferenceService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const liabilities = createRoadLiabilityService(fastify);

  async function handleAcceptedPosition(event: GpsAcceptedPositionEvent): Promise<void> {
    try {
      const now = event.current.capturedAt;
      const gates = await prisma.tollGate.findMany({
        where: {
          networkKey: TOLL_NETWORK_SALIK,
          isActive: true,
          OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        },
      });
      const active = gates.filter((gate) => !gate.effectiveTo || gate.effectiveTo > now);
      if (active.length === 0) return;

      const crossing = detectFirstCrossing(
        event.previous,
        event.current,
        active.map(toGateGeometry),
      );
      if (!crossing) return;

      await liabilities.ingestRoadObservation({
        sourceKey: "GPS_INFERENCE",
        authoritative: false,
        eventType: "SALIK_TOLL",
        vehicleId: event.vehicleId,
        occurredAt: crossing.occurredAt,
        receivedAt: new Date(),
        gateId: crossing.gateId,
        locationLabel: crossing.locationLabel,
        confidence: crossing.confidence,
      });
    } catch (err) {
      fastify.log.warn(
        {
          vehicleId: event.vehicleId,
          err: err instanceof Error ? err.message : "unknown",
        },
        "salik crossing inference failed",
      );
    }
  }

  return { handleAcceptedPosition };
}
