import type { FastifyInstance } from "fastify";
import type { MaintenanceOrderStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import type { AuthUser } from "src/lib/context/auth-context";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  ACTIVE_MAINTENANCE_STATUSES,
  MAINTENANCE_VEHICLE_LOCK_NS,
} from "src/modules/maintenance/maintenance.constants";
import {
  activeMaintenanceExistsError,
  invalidMaintenanceTransitionError,
  maintenanceCompletedImmutableError,
  maintenanceNotFoundError,
  scheduledAtMustBeFutureError,
  scheduledAtRequiredError,
  vehicleNotAvailableForMaintenanceError,
  vehicleNotFoundError,
} from "src/modules/maintenance/maintenance.errors";
import {
  isMaintenanceOverdue,
  maintenanceStatusFromDto,
  maintenanceTypeFromDto,
  MAINTENANCE_VEHICLE_INCLUDE,
  toMaintenanceDetail,
  toMaintenanceOrder,
  type MaintenanceOrderRow,
} from "src/modules/maintenance/maintenance.mapper";
import type {
  CreateMaintenanceSchema,
  ListMaintenanceQuerySchema,
  MaintenanceSummaryDto,
  UpdateMaintenanceSchema,
} from "src/modules/maintenance/maintenance.schema";

const ORDER_INCLUDE = {
  vehicle: { include: MAINTENANCE_VEHICLE_INCLUDE },
} satisfies Prisma.MaintenanceOrderInclude;

const SORTABLE = [
  "createdAt",
  "scheduledAt",
  "startedAt",
  "expectedCompletionAt",
  "status",
  "maintenanceType",
] as const;

type ListQuery = z.infer<typeof ListMaintenanceQuerySchema>;
type CreateBody = z.infer<typeof CreateMaintenanceSchema>;
type UpdateBody = z.infer<typeof UpdateMaintenanceSchema>;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function buildListWhere(query: ListQuery, now: Date): Prisma.MaintenanceOrderWhereInput {
  const and: Prisma.MaintenanceOrderWhereInput[] = [];

  if (query.vehicleId) and.push({ vehicleId: query.vehicleId });
  if (query.maintenanceType) {
    and.push({ maintenanceType: maintenanceTypeFromDto(query.maintenanceType) });
  }

  if (query.status === "overdue") {
    and.push({
      status: { in: ["SCHEDULED", "IN_SERVICE", "READY_FOR_PICKUP"] },
      OR: [
        { status: "SCHEDULED", scheduledAt: { lt: now } },
        {
          status: { in: ["IN_SERVICE", "READY_FOR_PICKUP"] },
          expectedCompletionAt: { lt: now },
        },
      ],
    });
  } else if (query.status && query.status !== "all") {
    and.push({ status: maintenanceStatusFromDto(query.status) });
  }

  if (query.search) {
    const term = query.search;
    and.push({
      OR: [
        { issueDescription: { contains: term, mode: "insensitive" } },
        { workshopName: { contains: term, mode: "insensitive" } },
        { vehicle: { vehicleName: { contains: term, mode: "insensitive" } } },
        { vehicle: { plateNumber: { contains: term, mode: "insensitive" } } },
        { vehicle: { model: { name: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function buildListOrderBy(query: ListQuery): Prisma.MaintenanceOrderOrderByWithRelationInput {
  const sort = parseSort(query.sort, SORTABLE, {
    field: "createdAt",
    direction: "desc",
  });
  return { [sort.field]: sort.direction };
}

async function loadOrderOrThrow(
  prisma: FastifyInstance["prisma"],
  id: number,
): Promise<MaintenanceOrderRow> {
  const row = await prisma.maintenanceOrder.findUnique({
    where: { id },
    include: ORDER_INCLUDE,
  });
  if (!row) throw maintenanceNotFoundError();
  return row;
}

async function assertNoActiveMaintenance(
  tx: Tx,
  vehicleId: number,
  exceptOrderId?: number,
): Promise<void> {
  const existing = await tx.maintenanceOrder.findFirst({
    where: {
      vehicleId,
      status: { in: ACTIVE_MAINTENANCE_STATUSES },
      ...(exceptOrderId ? { id: { not: exceptOrderId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw activeMaintenanceExistsError();
}

async function assertVehicleEligibleForNewMaintenance(
  tx: Tx,
  vehicleId: number,
): Promise<{ id: number; operationalStatus: string; isActive: boolean }> {
  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, operationalStatus: true, isActive: true },
  });
  if (!vehicle || !vehicle.isActive) throw vehicleNotFoundError();
  if (vehicle.operationalStatus !== "AVAILABLE") {
    throw vehicleNotAvailableForMaintenanceError(vehicle.operationalStatus);
  }
  return vehicle;
}

export function createMaintenanceService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  return {
    async list(query: ListQuery) {
      const now = new Date();
      const where = buildListWhere(query, now);
      const orderBy = buildListOrderBy(query);
      const result = await paginate({
        page: query.page,
        pageSize: query.pageSize,
        count: () => prisma.maintenanceOrder.count({ where }),
        findMany: (skip, take) =>
          prisma.maintenanceOrder.findMany({
            where,
            orderBy,
            skip,
            take,
            include: ORDER_INCLUDE,
          }),
      });
      return {
        data: result.data.map((row) => toMaintenanceOrder(row, now)),
        meta: result.meta,
      };
    },

    async summary(): Promise<MaintenanceSummaryDto> {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = startOfNextMonth(now);

      const [inService, scheduled, readyForPickup, completedThisMonth, overdueCandidates, costAgg] =
        await Promise.all([
          prisma.maintenanceOrder.count({ where: { status: "IN_SERVICE" } }),
          prisma.maintenanceOrder.count({ where: { status: "SCHEDULED" } }),
          prisma.maintenanceOrder.count({ where: { status: "READY_FOR_PICKUP" } }),
          prisma.maintenanceOrder.count({
            where: {
              status: "COMPLETED",
              completedAt: { gte: monthStart, lt: monthEnd },
            },
          }),
          prisma.maintenanceOrder.findMany({
            where: {
              status: { in: ["SCHEDULED", "IN_SERVICE", "READY_FOR_PICKUP"] },
            },
            select: {
              status: true,
              scheduledAt: true,
              expectedCompletionAt: true,
            },
          }),
          prisma.maintenanceOrder.aggregate({
            _sum: { cost: true },
            where: { cost: { not: null } },
          }),
        ]);

      const overdue = overdueCandidates.filter((row) => isMaintenanceOverdue(row, now)).length;

      return {
        inService,
        scheduled,
        readyForPickup,
        overdue,
        completedThisMonth,
        totalCost: costAgg._sum.cost ?? 0,
      };
    },

    async get(id: number) {
      const row = await loadOrderOrThrow(prisma, id);
      return toMaintenanceDetail(row);
    },

    async create(body: CreateBody, actor: AuthUser) {
      const now = new Date();
      if (body.startMode === "scheduled") {
        if (!body.scheduledAt) throw scheduledAtRequiredError();
        if (body.scheduledAt.getTime() <= now.getTime()) {
          throw scheduledAtMustBeFutureError();
        }
      }

      const row = await withTransaction(prisma, async (tx) => {
        await acquireAdvisoryLock(tx, MAINTENANCE_VEHICLE_LOCK_NS, body.vehicleId);
        await assertNoActiveMaintenance(tx, body.vehicleId);
        await assertVehicleEligibleForNewMaintenance(tx, body.vehicleId);

        const status: MaintenanceOrderStatus =
          body.startMode === "now" ? "IN_SERVICE" : "SCHEDULED";

        const order = await tx.maintenanceOrder.create({
          data: {
            vehicleId: body.vehicleId,
            status,
            maintenanceType: maintenanceTypeFromDto(body.maintenanceType),
            issueDescription: body.issueDescription.trim(),
            scheduledAt: body.startMode === "scheduled" ? body.scheduledAt : null,
            startedAt: body.startMode === "now" ? now : null,
            workshopName: body.workshopName?.trim() ?? null,
            odometerIn: body.odometerIn ?? null,
            expectedCompletionAt: body.expectedCompletionAt ?? null,
            notes: body.notes?.trim() ?? null,
            cost: body.cost ?? null,
            createdByUserId: actor.id,
          },
          include: ORDER_INCLUDE,
        });

        if (body.startMode === "now") {
          await tx.vehicle.update({
            where: { id: body.vehicleId },
            data: { operationalStatus: "SERVICE" },
          });
        }

        return tx.maintenanceOrder.findUniqueOrThrow({
          where: { id: order.id },
          include: ORDER_INCLUDE,
        });
      });

      return toMaintenanceDetail(row, now);
    },

    async update(id: number, body: UpdateBody) {
      const existing = await loadOrderOrThrow(prisma, id);
      if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        throw maintenanceCompletedImmutableError();
      }
      if (existing.status !== "SCHEDULED" && body.scheduledAt !== undefined) {
        throw invalidMaintenanceTransitionError(existing.status, "scheduledAt");
      }
      if (body.scheduledAt && body.scheduledAt.getTime() <= Date.now()) {
        throw scheduledAtMustBeFutureError();
      }

      const row = await prisma.maintenanceOrder.update({
        where: { id },
        data: {
          ...(body.issueDescription !== undefined
            ? { issueDescription: body.issueDescription.trim() }
            : {}),
          ...(body.maintenanceType !== undefined
            ? { maintenanceType: maintenanceTypeFromDto(body.maintenanceType) }
            : {}),
          ...(body.workshopName !== undefined
            ? { workshopName: body.workshopName?.trim() ?? null }
            : {}),
          ...(body.odometerIn !== undefined ? { odometerIn: body.odometerIn } : {}),
          ...(body.expectedCompletionAt !== undefined
            ? { expectedCompletionAt: body.expectedCompletionAt }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes?.trim() ?? null } : {}),
          ...(body.cost !== undefined ? { cost: body.cost } : {}),
          ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt } : {}),
        },
        include: ORDER_INCLUDE,
      });

      return toMaintenanceDetail(row);
    },

    async start(id: number) {
      const now = new Date();
      const row = await withTransaction(prisma, async (tx) => {
        const existing = await tx.maintenanceOrder.findUnique({
          where: { id },
          include: ORDER_INCLUDE,
        });
        if (!existing) throw maintenanceNotFoundError();
        if (existing.status !== "SCHEDULED") {
          throw invalidMaintenanceTransitionError(existing.status, "IN_SERVICE");
        }

        await acquireAdvisoryLock(tx, MAINTENANCE_VEHICLE_LOCK_NS, existing.vehicleId);
        await assertVehicleEligibleForNewMaintenance(tx, existing.vehicleId);
        await assertNoActiveMaintenance(tx, existing.vehicleId, id);

        const updated = await tx.maintenanceOrder.update({
          where: { id },
          data: {
            status: "IN_SERVICE",
            startedAt: now,
          },
          include: ORDER_INCLUDE,
        });

        await tx.vehicle.update({
          where: { id: existing.vehicleId },
          data: { operationalStatus: "SERVICE" },
        });

        return tx.maintenanceOrder.findUniqueOrThrow({
          where: { id: updated.id },
          include: ORDER_INCLUDE,
        });
      });

      return toMaintenanceDetail(row, now);
    },

    async markReady(id: number) {
      const now = new Date();
      const row = await withTransaction(prisma, async (tx) => {
        const existing = await tx.maintenanceOrder.findUnique({
          where: { id },
          include: ORDER_INCLUDE,
        });
        if (!existing) throw maintenanceNotFoundError();
        if (existing.status !== "IN_SERVICE") {
          throw invalidMaintenanceTransitionError(existing.status, "READY_FOR_PICKUP");
        }
        if (existing.vehicle.operationalStatus !== "SERVICE") {
          throw vehicleNotAvailableForMaintenanceError(existing.vehicle.operationalStatus);
        }

        return tx.maintenanceOrder.update({
          where: { id },
          data: {
            status: "READY_FOR_PICKUP",
            readyAt: now,
          },
          include: ORDER_INCLUDE,
        });
      });

      return toMaintenanceDetail(row, now);
    },

    async complete(id: number) {
      const now = new Date();
      const row = await withTransaction(prisma, async (tx) => {
        const existing = await tx.maintenanceOrder.findUnique({
          where: { id },
          include: ORDER_INCLUDE,
        });
        if (!existing) throw maintenanceNotFoundError();
        if (existing.status !== "READY_FOR_PICKUP") {
          throw invalidMaintenanceTransitionError(existing.status, "COMPLETED");
        }
        if (existing.vehicle.operationalStatus !== "SERVICE") {
          throw vehicleNotAvailableForMaintenanceError(existing.vehicle.operationalStatus);
        }

        await acquireAdvisoryLock(tx, MAINTENANCE_VEHICLE_LOCK_NS, existing.vehicleId);
        await assertNoActiveMaintenance(tx, existing.vehicleId, id);

        const updated = await tx.maintenanceOrder.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt: now,
          },
          include: ORDER_INCLUDE,
        });

        await tx.vehicle.update({
          where: { id: existing.vehicleId },
          data: { operationalStatus: "AVAILABLE" },
        });

        return tx.maintenanceOrder.findUniqueOrThrow({
          where: { id: updated.id },
          include: ORDER_INCLUDE,
        });
      });

      return toMaintenanceDetail(row, now);
    },

    async cancel(id: number) {
      const now = new Date();
      const row = await withTransaction(prisma, async (tx) => {
        const existing = await tx.maintenanceOrder.findUnique({
          where: { id },
          include: ORDER_INCLUDE,
        });
        if (!existing) throw maintenanceNotFoundError();
        if (existing.status !== "SCHEDULED") {
          throw invalidMaintenanceTransitionError(existing.status, "CANCELLED");
        }

        return tx.maintenanceOrder.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: ORDER_INCLUDE,
        });
      });

      return toMaintenanceDetail(row, now);
    },
  };
}
