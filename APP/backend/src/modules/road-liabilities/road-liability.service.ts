import type { FastifyInstance } from "fastify";
import type { Prisma, RoadLiability } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  ROAD_LIABILITY_INGEST_LOCK_NS,
  ROAD_LIABILITY_OUTBOX_AGGREGATE,
  ROAD_LIABILITY_OUTBOX_EVENT,
} from "src/modules/road-liabilities/road-liability.constants";
import { roadLiabilityNotFoundError } from "src/modules/road-liabilities/road-liability.errors";
import {
  buildGpsInferenceFingerprint,
  buildIngestionFingerprint,
} from "src/modules/road-liabilities/road-liability.fingerprint";
import {
  attributionStatusFromDto,
  collectionStatusFromDto,
  COLLECTIBLE_WHERE,
  confirmationStatusFromDto,
  deriveCollectionStatus,
  isChargeableRoadLiability,
  NEEDS_ATTENTION_WHERE,
  normalizeWholeAedAmount,
  ROAD_LIABILITY_LIST_INCLUDE,
  roadLiabilityTypeFromDto,
  SETTLED_WHERE,
  toChargeable,
  toDetail,
  toListItem,
} from "src/modules/road-liabilities/road-liability.mapper";
import {
  createRtaProvider,
  createSalikProvider,
} from "src/modules/road-liabilities/road-liability.provider";
import type {
  ListRoadLiabilitiesQuery,
  RoadLiabilitySummary,
} from "src/modules/road-liabilities/road-liability.schema";
import type { NormalizedRoadObservationInput } from "src/modules/road-liabilities/road-liability.types";
import { createContractAttributionService } from "src/modules/road-liabilities/matching/contract-attribution.service";
import { createObservationMatchService } from "src/modules/road-liabilities/matching/observation-match.service";
import { createVehicleMatchService } from "src/modules/road-liabilities/matching/vehicle-match.service";

const SORTABLE = ["occurredAt", "createdAt", "amount", "type"] as const;

function fingerprintFor(input: NormalizedRoadObservationInput, extras: {
  plateNumberNormalized: string | null;
  amount: number | null;
}): string {
  if (input.sourceKey === "GPS_INFERENCE" && input.vehicleId != null && input.gateId) {
    return buildGpsInferenceFingerprint({
      vehicleId: input.vehicleId,
      gateId: input.gateId,
      occurredAt: input.occurredAt,
    });
  }
  return buildIngestionFingerprint({
    sourceKey: input.sourceKey,
    eventType: input.eventType,
    externalEventId: input.externalEventId,
    vehicleId: input.vehicleId,
    plateNumberNormalized: extras.plateNumberNormalized,
    externalVehicleRef: input.externalVehicleRef,
    gateId: input.gateId,
    externalReference: input.externalReference,
    occurredAt: input.occurredAt,
    amount: extras.amount,
  });
}

function maybeWriteChargeableOutbox(
  tx: Tx,
  liability: Pick<
    RoadLiability,
    | "id"
    | "type"
    | "vehicleId"
    | "attributedContractId"
    | "amount"
    | "currency"
    | "occurredAt"
    | "authoritativeSourceKey"
    | "confirmationStatus"
    | "attributionStatus"
    | "collectionStatus"
  >,
): Promise<void> {
  if (!isChargeableRoadLiability(liability) || liability.attributedContractId == null) {
    return Promise.resolve();
  }
  return writeOutboxEvent(tx, {
    eventType: ROAD_LIABILITY_OUTBOX_EVENT,
    aggregateType: ROAD_LIABILITY_OUTBOX_AGGREGATE,
    aggregateId: liability.id,
    dedupeKey: `${ROAD_LIABILITY_OUTBOX_EVENT}:${liability.id}`,
    payload: {
      liabilityId: liability.id,
      contractId: liability.attributedContractId,
      vehicleId: liability.vehicleId,
      type: liability.type,
      sourceKey: liability.authoritativeSourceKey,
      amount: liability.amount,
      currency: liability.currency,
      occurredAt: liability.occurredAt.toISOString(),
    },
  }).then(() => undefined);
}

export function createRoadLiabilityService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function ingestRoadObservation(raw: NormalizedRoadObservationInput) {
    const receivedAt = raw.receivedAt ?? new Date();
    const sourceKey = raw.sourceKey.trim();
    const gpsInference = sourceKey === "GPS_INFERENCE";
    const authoritative = gpsInference ? false : Boolean(raw.authoritative);
    const amount = gpsInference ? null : normalizeWholeAedAmount(raw.amount);
    const currency = amount != null ? (raw.currency?.trim() || "AED") : null;
    const externalEventId = raw.externalEventId?.trim() || null;

    return withTransaction(prisma, async (tx) => {
      const vehicles = createVehicleMatchService(tx);
      const attribution = createContractAttributionService(tx);
      const observationMatch = createObservationMatchService(tx);

      const matchedVehicle = await vehicles.matchVehicle({
        vehicleId: raw.vehicleId,
        plateNumber: raw.plateNumber,
        externalVehicleRef: raw.externalVehicleRef,
      });

      const fingerprint = fingerprintFor(
        { ...raw, sourceKey, vehicleId: matchedVehicle.vehicleId ?? raw.vehicleId },
        { plateNumberNormalized: matchedVehicle.plateNumberNormalized, amount },
      );

      await acquireAdvisoryLock(tx, ROAD_LIABILITY_INGEST_LOCK_NS, fingerprint);

      if (externalEventId) {
        const existingByExternal = await tx.roadLiabilityObservation.findUnique({
          where: {
            sourceKey_externalEventId: { sourceKey, externalEventId },
          },
          include: { liability: true },
        });
        if (existingByExternal) {
          return {
            observationId: existingByExternal.id,
            liabilityId: existingByExternal.liabilityId,
            duplicated: true,
          };
        }
      }

      const existingByFingerprint = await tx.roadLiabilityObservation.findUnique({
        where: { ingestionFingerprint: fingerprint },
        include: { liability: true },
      });
      if (existingByFingerprint) {
        return {
          observationId: existingByFingerprint.id,
          liabilityId: existingByFingerprint.liabilityId,
          duplicated: true,
        };
      }

      if (gpsInference && matchedVehicle.vehicleId && raw.gateId) {
        const jitter = await observationMatch.findDuplicateGpsInference({
          vehicleId: matchedVehicle.vehicleId,
          gateId: raw.gateId,
          occurredAt: raw.occurredAt,
        });
        if (jitter) {
          return {
            observationId: jitter.id,
            liabilityId: jitter.liabilityId,
            duplicated: true,
          };
        }
      }

      const custody = await attribution.attributeByVehiclePossession({
        vehicleId: matchedVehicle.vehicleId,
        occurredAt: raw.occurredAt,
      });
      const attributionStatus =
        custody.status === "MATCHED"
          ? "MATCHED"
          : custody.status === "AMBIGUOUS"
            ? "AMBIGUOUS"
            : "UNMATCHED";
      const attributedContractId = custody.status === "MATCHED" ? custody.contractId : null;

      let liabilityId: string | null = null;

      if (authoritative) {
        const prediction = await observationMatch.findGpsPredictionCandidate({
          vehicleId: matchedVehicle.vehicleId,
          gateId: raw.gateId ?? null,
          eventType: raw.eventType,
          occurredAt: raw.occurredAt,
        });
        if (prediction?.liability) {
          const collectionStatus = deriveCollectionStatus({
            confirmationStatus: "CONFIRMED",
            attributionStatus,
            attributedContractId,
            amount,
            current: prediction.liability.collectionStatus,
          });
          const updated = await tx.roadLiability.update({
            where: { id: prediction.liability.id },
            data: {
              type: raw.eventType,
              vehicleId: matchedVehicle.vehicleId,
              occurredAt: raw.occurredAt,
              gateId: raw.gateId ?? prediction.liability.gateId,
              locationLabel: raw.locationLabel ?? prediction.liability.locationLabel,
              amount,
              currency,
              authoritativeSourceKey: sourceKey,
              authoritativeExternalReference: raw.externalReference?.trim() || null,
              confirmationStatus: "CONFIRMED",
              attributionStatus,
              collectionStatus,
              attributedContractId,
              confirmedAt: receivedAt,
            },
          });
          liabilityId = updated.id;
          await maybeWriteChargeableOutbox(tx, updated);
        }
      }

      if (!liabilityId) {
        const confirmationStatus = authoritative ? "CONFIRMED" : "PENDING_CONFIRMATION";
        const collectionStatus = deriveCollectionStatus({
          confirmationStatus,
          attributionStatus,
          attributedContractId,
          amount,
        });
        const created = await tx.roadLiability.create({
          data: {
            type: raw.eventType,
            vehicleId: matchedVehicle.vehicleId,
            occurredAt: raw.occurredAt,
            gateId: raw.gateId ?? null,
            locationLabel: raw.locationLabel ?? null,
            amount,
            currency,
            authoritativeSourceKey: authoritative ? sourceKey : null,
            authoritativeExternalReference: authoritative
              ? raw.externalReference?.trim() || null
              : null,
            confirmationStatus,
            attributionStatus,
            collectionStatus,
            attributedContractId,
            confirmedAt: authoritative ? receivedAt : null,
          },
        });
        liabilityId = created.id;
        await maybeWriteChargeableOutbox(tx, created);
      }

      try {
        const observation = await tx.roadLiabilityObservation.create({
          data: {
            sourceKey,
            authoritative,
            externalEventId,
            ingestionFingerprint: fingerprint,
            eventType: raw.eventType,
            vehicleId: matchedVehicle.vehicleId,
            plateNumberNormalized: matchedVehicle.plateNumberNormalized,
            externalVehicleRef: raw.externalVehicleRef?.trim() || null,
            occurredAt: raw.occurredAt,
            amount,
            currency,
            externalReference: raw.externalReference?.trim() || null,
            gateId: raw.gateId ?? null,
            locationLabel: raw.locationLabel ?? null,
            confidence: gpsInference ? (raw.confidence ?? null) : raw.confidence ?? null,
            liabilityId,
            receivedAt,
          },
        });
        return { observationId: observation.id, liabilityId, duplicated: false };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await tx.roadLiabilityObservation.findUnique({
          where: { ingestionFingerprint: fingerprint },
        });
        return {
          observationId: raced?.id ?? null,
          liabilityId: raced?.liabilityId ?? liabilityId,
          duplicated: true,
        };
      }
    });
  }

  function buildListWhere(query: ListRoadLiabilitiesQuery): Prisma.RoadLiabilityWhereInput {
    const and: Prisma.RoadLiabilityWhereInput[] = [];
    if (query.type) and.push({ type: roadLiabilityTypeFromDto(query.type) });
    if (query.confirmationStatus) {
      and.push({ confirmationStatus: confirmationStatusFromDto(query.confirmationStatus) });
    }
    if (query.attributionStatus) {
      and.push({ attributionStatus: attributionStatusFromDto(query.attributionStatus) });
    }
    if (query.collectionStatus) {
      and.push({ collectionStatus: collectionStatusFromDto(query.collectionStatus) });
    }
    if (query.vehicleId) and.push({ vehicleId: query.vehicleId });
    if (query.contractId) and.push({ attributedContractId: query.contractId });
    // Contract-first, exactly like `resolveRoadLiabilityCompany`: an attributed
    // Contract decides the company, and the Vehicle only answers for liabilities
    // that have no Contract. Filtering on the Vehicle unconditionally would show a
    // UNIQUE-vehicle liability under UNIQUE even though its ELITE Contract owns it.
    if (query.companyId) {
      and.push({
        OR: [
          { attributedContract: { companyId: query.companyId } },
          { attributedContractId: null, vehicle: { companyId: query.companyId } },
        ],
      });
    }
    if (query.occurredFrom || query.occurredTo) {
      and.push({
        occurredAt: {
          ...(query.occurredFrom ? { gte: query.occurredFrom } : {}),
          ...(query.occurredTo ? { lte: query.occurredTo } : {}),
        },
      });
    }
    if (query.channel === "RTA") {
      and.push({ type: "RTA_VIOLATION" });
    } else if (query.channel === "SALIK") {
      and.push({ type: { in: ["SALIK_TOLL", "SALIK_VIOLATION"] } });
    }
    if (query.queue === "collectible") {
      and.push(COLLECTIBLE_WHERE);
    } else if (query.queue === "needs_attention") {
      and.push(NEEDS_ATTENTION_WHERE);
    } else if (query.queue === "settled") {
      and.push(SETTLED_WHERE);
    }
    if (query.sourceKey) {
      and.push({
        OR: [
          { authoritativeSourceKey: query.sourceKey },
          { observations: { some: { sourceKey: query.sourceKey } } },
        ],
      });
    }
    if (query.search) {
      and.push({
        OR: [
          { vehicle: { vehicleName: { contains: query.search, mode: "insensitive" } } },
          { vehicle: { plateNumber: { contains: query.search, mode: "insensitive" } } },
          {
            attributedContract: {
              contractNumber: { contains: query.search, mode: "insensitive" },
            },
          },
          {
            attributedContract: {
              customer: { name: { contains: query.search, mode: "insensitive" } },
            },
          },
          { authoritativeExternalReference: { contains: query.search, mode: "insensitive" } },
          { locationLabel: { contains: query.search, mode: "insensitive" } },
          {
            observations: {
              some: { externalReference: { contains: query.search, mode: "insensitive" } },
            },
          },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  async function summary(): Promise<RoadLiabilitySummary> {
    const [
      total,
      pendingConfirmationCount,
      confirmedOpen,
      matchedCount,
      unmatchedCount,
      ambiguousCount,
      settledCount,
      needsAttentionCount,
      rtaViolations,
      salikTolls,
      salikViolations,
    ] = await Promise.all([
      prisma.roadLiability.count(),
      prisma.roadLiability.count({ where: { confirmationStatus: "PENDING_CONFIRMATION" } }),
      prisma.roadLiability.aggregate({
        where: { confirmationStatus: "CONFIRMED", collectionStatus: "OPEN" },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.roadLiability.count({ where: { attributionStatus: "MATCHED" } }),
      prisma.roadLiability.count({ where: { attributionStatus: "UNMATCHED" } }),
      prisma.roadLiability.count({ where: { attributionStatus: "AMBIGUOUS" } }),
      prisma.roadLiability.count({ where: { collectionStatus: "SETTLED" } }),
      prisma.roadLiability.count({ where: NEEDS_ATTENTION_WHERE }),
      prisma.roadLiability.count({ where: { type: "RTA_VIOLATION" } }),
      prisma.roadLiability.count({ where: { type: "SALIK_TOLL" } }),
      prisma.roadLiability.count({ where: { type: "SALIK_VIOLATION" } }),
    ]);

    return {
      total,
      pendingConfirmationCount,
      confirmedOpenCount: confirmedOpen._count._all,
      confirmedOpenAmount: confirmedOpen._sum.amount ?? 0,
      matchedCount,
      unmatchedCount,
      ambiguousCount,
      settledCount,
      needsAttentionCount,
      byType: { rtaViolations, salikTolls, salikViolations },
      providers: {
        rtaConfigured: createRtaProvider().configured,
        salikConfigured: createSalikProvider().configured,
        tarsTrafficCapabilityVerified: false,
      },
    };
  }

  async function list(query: ListRoadLiabilitiesQuery) {
    const where = buildListWhere(query);
    const { field, direction } = parseSort(query.sort, SORTABLE, {
      field: "occurredAt",
      direction: "desc",
    });
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.roadLiability.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.roadLiability.findMany({
          where,
          include: ROAD_LIABILITY_LIST_INCLUDE,
          orderBy: { [field]: direction },
          skip,
          take,
        });
        return rows.map(toListItem);
      },
    });
  }

  async function get(id: string) {
    const row = await prisma.roadLiability.findUnique({
      where: { id },
      include: ROAD_LIABILITY_LIST_INCLUDE,
    });
    if (!row) throw roadLiabilityNotFoundError();
    return toDetail(row);
  }

  async function listChargeableLiabilitiesForContract(contractId: string) {
    const rows = await prisma.roadLiability.findMany({
      where: {
        attributedContractId: contractId,
        confirmationStatus: "CONFIRMED",
        attributionStatus: "MATCHED",
        collectionStatus: "OPEN",
        amount: { gt: 0 },
      },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(toChargeable).filter((row): row is NonNullable<typeof row> => row != null);
  }

  return {
    ingestRoadObservation,
    summary,
    list,
    get,
    listChargeableLiabilitiesForContract,
  };
}
