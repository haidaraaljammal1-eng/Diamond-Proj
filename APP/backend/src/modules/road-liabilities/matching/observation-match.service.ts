import type { PrismaClient, RoadLiabilityType } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import {
  AUTHORITATIVE_PREDICTION_MATCH_MS,
  GPS_CROSSING_DEDUP_MS,
} from "src/modules/road-liabilities/road-liability.constants";

type Db = PrismaClient | Tx;

export function createObservationMatchService(prisma: Db) {
  async function findDuplicateGpsInference(input: {
    vehicleId: number;
    gateId: string;
    occurredAt: Date;
  }) {
    const from = new Date(input.occurredAt.getTime() - GPS_CROSSING_DEDUP_MS);
    const to = new Date(input.occurredAt.getTime() + GPS_CROSSING_DEDUP_MS);
    return prisma.roadLiabilityObservation.findFirst({
      where: {
        sourceKey: "GPS_INFERENCE",
        eventType: "SALIK_TOLL",
        vehicleId: input.vehicleId,
        gateId: input.gateId,
        occurredAt: { gte: from, lte: to },
      },
      include: { liability: true },
      orderBy: { occurredAt: "asc" },
    });
  }

  /**
   * Official Salik/RTA confirmation may upgrade exactly one GPS prediction.
   * Match by vehicle + compatible type + close time + same gate when both known.
   * Amount is never a match key. Multiple plausible candidates are not merged.
   */
  async function findGpsPredictionCandidate(input: {
    vehicleId: number | null;
    gateId: string | null;
    eventType: RoadLiabilityType;
    occurredAt: Date;
  }) {
    if (input.vehicleId == null) return null;
    if (input.eventType !== "SALIK_TOLL") return null;

    const from = new Date(input.occurredAt.getTime() - AUTHORITATIVE_PREDICTION_MATCH_MS);
    const to = new Date(input.occurredAt.getTime() + AUTHORITATIVE_PREDICTION_MATCH_MS);

    const candidates = await prisma.roadLiabilityObservation.findMany({
      where: {
        sourceKey: "GPS_INFERENCE",
        eventType: input.eventType,
        vehicleId: input.vehicleId,
        occurredAt: { gte: from, lte: to },
        liability: { confirmationStatus: "PENDING_CONFIRMATION" },
        ...(input.gateId ? { gateId: input.gateId } : {}),
      },
      include: { liability: true },
      orderBy: { occurredAt: "asc" },
    });

    if (candidates.length === 0) return null;

    const gated = input.gateId
      ? candidates.filter((c) => c.gateId === input.gateId)
      : candidates;
    const pool = gated.length > 0 ? gated : input.gateId ? [] : candidates;
    if (pool.length !== 1) return null;
    return pool[0]!;
  }

  return { findDuplicateGpsInference, findGpsPredictionCandidate };
}
