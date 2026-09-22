import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { paginate, parseSort } from "src/lib/http/pagination";
import { loadCurrentRentalsByVehicleIds } from "src/modules/contracts/current-rental";
import { operationalStatusFromDto } from "src/modules/vehicles/vehicles.mapper";
import { gpsConfig } from "src/modules/gps/gps.config";
import { GPS_LATEST_LOCK_NS } from "src/modules/gps/gps.constants";
import {
  gpsBindingRequiredError,
  gpsVehicleNotFoundError,
} from "src/modules/gps/gps.errors";
import {
  deriveMotionState,
  deriveTrackingStatus,
  GPS_VEHICLE_INCLUDE,
  shouldApplyIncomingPosition,
  toGpsDetail,
  toGpsListItem,
  toGpsMapPoint,
  tallyGpsSummaryStatuses,
  trackingStatusWhere,
  validateNormalizedPosition,
} from "src/modules/gps/gps.mapper";
import { notifyGpsAcceptedPosition } from "src/modules/gps/gps.observers";
import { createGpsProvider } from "src/modules/gps/gps.provider";
import type {
  GpsAcceptedPoint,
  GpsIngestOutcome,
  NormalizedGpsPositionInput,
} from "src/modules/gps/gps.types";
import type {
  GpsSummary,
  ListGpsVehiclesQuery,
} from "src/modules/gps/gps.schema";
import type { GpsTrackingStatusDto } from "src/modules/gps/gps.constants";

const SORTABLE = ["vehicleName", "plateNumber", "operationalStatus", "createdAt"] as const;

const MAP_POINTS_CAP = 500;

function providerConfigured(): boolean {
  return createGpsProvider().configured;
}

export function createGpsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function ingestLatestPosition(
    input: NormalizedGpsPositionInput,
  ): Promise<GpsIngestOutcome> {
    const config = gpsConfig();
    const now = new Date();
    const validated = validateNormalizedPosition(input, now);
    const motionState = deriveMotionState(
      validated.speedKph,
      config.movingSpeedThresholdKph,
    );

    let previousPoint: GpsAcceptedPoint | null = null;
    let currentPoint: GpsAcceptedPoint | null = null;

    const outcome = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, GPS_LATEST_LOCK_NS, input.vehicleId);
      const vehicle = await tx.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { id: true },
      });
      if (!vehicle) throw gpsVehicleNotFoundError();

      const binding = await tx.vehicleGpsBinding.findUnique({
        where: { vehicleId: input.vehicleId },
      });
      if (!binding?.isActive) throw gpsBindingRequiredError();

      const existing = await tx.vehicleGpsLatestState.findUnique({
        where: { vehicleId: input.vehicleId },
      });
      const decision = shouldApplyIncomingPosition({
        existingCapturedAt: existing?.capturedAt ?? null,
        existingSourceEventId: existing?.sourceEventId ?? null,
        incomingCapturedAt: validated.capturedAt,
        incomingSourceEventId: validated.sourceEventId,
      });
      if (decision === "stale" || decision === "duplicate_event") {
        return { applied: false as const, reason: decision };
      }

      const data = {
        latitude: new Prisma.Decimal(validated.latitude.toFixed(7)),
        longitude: new Prisma.Decimal(validated.longitude.toFixed(7)),
        speedKph:
          validated.speedKph == null
            ? null
            : new Prisma.Decimal(validated.speedKph.toFixed(3)),
        headingDegrees:
          validated.headingDegrees == null
            ? null
            : new Prisma.Decimal(validated.headingDegrees.toFixed(2)),
        accuracyMeters:
          validated.accuracyMeters == null
            ? null
            : new Prisma.Decimal(validated.accuracyMeters.toFixed(2)),
        motionState,
        capturedAt: validated.capturedAt,
        receivedAt: validated.receivedAt,
        sourceEventId: validated.sourceEventId,
        bindingId: binding.id,
      };

      if (existing) {
        previousPoint = {
          latitude: existing.latitude.toNumber(),
          longitude: existing.longitude.toNumber(),
          capturedAt: existing.capturedAt,
          headingDegrees: existing.headingDegrees?.toNumber() ?? null,
        };
        currentPoint = {
          latitude: validated.latitude,
          longitude: validated.longitude,
          capturedAt: validated.capturedAt,
          headingDegrees: validated.headingDegrees,
        };
        await tx.vehicleGpsLatestState.update({
          where: { id: existing.id },
          data,
        });
        return { applied: true as const, reason: "replaced" as const };
      }

      await tx.vehicleGpsLatestState.create({
        data: {
          vehicleId: input.vehicleId,
          ...data,
        },
      });
      return { applied: true as const, reason: "created" as const };
    });

    if (outcome.applied && previousPoint && currentPoint) {
      try {
        await notifyGpsAcceptedPosition({
          vehicleId: input.vehicleId,
          previous: previousPoint,
          current: currentPoint,
        });
      } catch (err) {
        fastify.log.warn(
          {
            vehicleId: input.vehicleId,
            err: err instanceof Error ? err.message : "unknown",
          },
          "gps accepted-position observer failed",
        );
      }
    }

    return outcome;
  }

  async function summary(companyId?: number): Promise<GpsSummary> {
    const configured = providerConfigured();
    const config = gpsConfig();
    const now = new Date();
    const vehiclesWhere = { isActive: true, ...(companyId != null ? { companyId } : {}) };
    const totalVehicles = await prisma.vehicle.count({ where: vehiclesWhere });

    if (!configured) {
      return {
        providerConfigured: false,
        totalVehicles,
        trackedVehicles: 0,
        moving: 0,
        parked: 0,
        online: 0,
        offline: 0,
        noData: 0,
        unassigned: 0,
        lastLocationUpdateAt: null,
      };
    }

    const bindings = await prisma.vehicleGpsBinding.findMany({
      where: { vehicle: vehiclesWhere },
      select: {
        isActive: true,
        latestState: {
          select: { capturedAt: true, motionState: true },
        },
      },
    });

    let trackedVehicles = 0;
    const statuses: GpsTrackingStatusDto[] = [];
    let lastLocationUpdateAt: Date | null = null;

    for (const binding of bindings) {
      if (!binding.isActive) continue;
      trackedVehicles += 1;
      statuses.push(
        deriveTrackingStatus({
          providerConfigured: true,
          binding: { id: "binding", isActive: true },
          latest: binding.latestState
            ? {
                capturedAt: binding.latestState.capturedAt,
                motionState: binding.latestState.motionState,
              }
            : null,
          now,
          offlineAfterMinutes: config.offlineAfterMinutes,
        }),
      );
      const captured = binding.latestState?.capturedAt;
      if (captured && (!lastLocationUpdateAt || captured > lastLocationUpdateAt)) {
        lastLocationUpdateAt = captured;
      }
    }

    const tallies = tallyGpsSummaryStatuses(statuses);

    return {
      providerConfigured: true,
      totalVehicles,
      trackedVehicles,
      moving: tallies.moving,
      parked: tallies.parked,
      online: tallies.online,
      offline: tallies.offline,
      noData: tallies.noData,
      unassigned: Math.max(0, totalVehicles - trackedVehicles),
      lastLocationUpdateAt,
    };
  }

  async function list(query: ListGpsVehiclesQuery) {
    const configured = providerConfigured();
    const config = gpsConfig();
    const now = new Date();
    const cutoff = new Date(now.getTime() - config.offlineAfterMinutes * 60_000);

    const where: Prisma.VehicleWhereInput = {
      isActive: true,
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.status && query.status !== "all"
        ? { operationalStatus: operationalStatusFromDto(query.status) }
        : {}),
      ...(query.search
        ? {
            OR: [
              { vehicleName: { contains: query.search, mode: "insensitive" as const } },
              { plateNumber: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(query.trackingStatus
        ? trackingStatusWhere(query.trackingStatus, configured, cutoff)
        : {}),
    };

    const { field, direction } = parseSort(query.sort, SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });

    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.vehicle.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.vehicle.findMany({
          where,
          include: GPS_VEHICLE_INCLUDE,
          orderBy: { [field]: direction },
          skip,
          take,
        });
        const rentals = await loadCurrentRentalsByVehicleIds(
          prisma,
          rows.map((row) => row.id),
        );
        return rows.map((row) =>
          toGpsListItem({
            row,
            rental: rentals.get(row.id) ?? null,
            providerConfigured: configured,
            now,
            offlineAfterMinutes: config.offlineAfterMinutes,
          }),
        );
      },
    });
  }

  async function mapPoints() {
    const configured = providerConfigured();
    if (!configured) return [];
    const config = gpsConfig();
    const now = new Date();
    const rows = await prisma.vehicle.findMany({
      where: {
        isActive: true,
        gpsBinding: { isActive: true },
        gpsLatestState: { isNot: null },
      },
      include: GPS_VEHICLE_INCLUDE,
      take: MAP_POINTS_CAP,
      orderBy: { gpsLatestState: { capturedAt: "desc" } },
    });
    const rentals = await loadCurrentRentalsByVehicleIds(
      prisma,
      rows.map((row) => row.id),
    );
    return rows
      .map((row) =>
        toGpsMapPoint({
          row,
          rental: rentals.get(row.id) ?? null,
          providerConfigured: configured,
          now,
          offlineAfterMinutes: config.offlineAfterMinutes,
        }),
      )
      .filter((point): point is NonNullable<typeof point> => point != null);
  }

  async function getVehicle(vehicleId: number) {
    const configured = providerConfigured();
    const config = gpsConfig();
    const now = new Date();
    const row = await prisma.vehicle.findFirst({
      where: { id: vehicleId, isActive: true },
      include: GPS_VEHICLE_INCLUDE,
    });
    if (!row) throw gpsVehicleNotFoundError();
    const rentals = await loadCurrentRentalsByVehicleIds(prisma, [row.id]);
    return toGpsDetail({
      row,
      rental: rentals.get(row.id) ?? null,
      providerConfigured: configured,
      now,
      offlineAfterMinutes: config.offlineAfterMinutes,
    });
  }

  return {
    ingestLatestPosition,
    summary,
    list,
    mapPoints,
    getVehicle,
  };
}
