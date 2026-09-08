import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  assertVinUnchanged,
  conflictError,
  inactiveReferenceError,
  invalidParentError,
  normalizeExternalId,
  normalizePlateNumber,
  normalizeVin,
} from "src/lib/master-data/code";
import {
  operationalStatusFromDto,
  operationalStatusToDto,
  fleetVehicleTypeLabel,
  normalizeFleetTypeKey,
  resolvePrimaryImage,
  toVehicleImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";
import { loadCurrentRentalsByVehicleIds } from "src/modules/contracts/current-rental";
import { vehicleHasBlockingContract } from "src/modules/contracts/vehicle-rental-guard";
import { buildVehicleListOrderBy } from "src/modules/vehicles/vehicles-sort";
import type {
  CreateVehicleSchema,
  FleetVehicleTypeOption,
  ListVehiclesQuerySchema,
  UpdateVehicleSchema,
  VehicleCard,
  VehicleDetail,
  VehiclePublic,
} from "src/modules/vehicles/vehicles.schema";

const VEHICLE_SORTABLE = [
  "vin",
  "plateNumber",
  "modelYear",
  "dailyRate",
  "monthlyRate",
  "operationalStatus",
  "createdAt",
  "isActive",
] as const;

const VEHICLE_CARD_INCLUDE = {
  model: { select: { id: true, code: true, name: true } },
  photos: {
    orderBy: [
      { isPrimary: "desc" as const },
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const },
    ],
    include: { attachment: { select: { mimeType: true } } },
  },
} satisfies Prisma.VehicleInclude;

type VehicleCardRow = Prisma.VehicleGetPayload<{ include: typeof VEHICLE_CARD_INCLUDE }>;

function vinConflict(): AppError {
  return conflictError("vehicle", "vin", "A vehicle with this VIN already exists");
}
function externalIdConflict(): AppError {
  return conflictError(
    "vehicle",
    "externalId",
    "This external identifier is already in use",
  );
}
function plateConflict(): AppError {
  return conflictError(
    "vehicle",
    "plateNumber",
    "A vehicle with this plate number already exists",
  );
}

function rentedVehicleLocked(): AppError {
  return AppError.conflict("Vehicle is rented and cannot be modified", [
    {
      resource: "vehicle",
      field: "operationalStatus",
      message: "Vehicle is rented",
    },
  ]);
}

async function assertVehicleMutableForFleetOps(
  prisma: PrismaClient,
  vehicle: { id: number; operationalStatus: string },
): Promise<void> {
  if (vehicle.operationalStatus === "RENTED") throw rentedVehicleLocked();
  if (await vehicleHasBlockingContract(prisma, vehicle.id)) throw rentedVehicleLocked();
}

function toVehiclePublic(row: VehicleCardRow): VehiclePublic {
  return {
    id: row.id,
    vin: row.vin,
    vehicleName: row.vehicleName,
    modelId: row.modelId,
    modelYear: row.modelYear,
    color: row.color,
    plateNumber: row.plateNumber,
    dailyRate: row.dailyRate,
    monthlyRate: row.monthlyRate,
    operationalStatus: operationalStatusToDto(row.operationalStatus),
    externalId: row.externalId,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toVehicleCard(
  row: VehicleCardRow,
  currentRental: VehicleCard["currentRental"],
): VehicleCard {
  return {
    ...toVehiclePublic(row),
    displayName: vehicleDisplayName({
      vehicleName: row.vehicleName,
      modelName: row.model?.name ?? null,
      modelYear: row.modelYear,
      plateNumber: row.plateNumber,
    }),
    model: row.model,
    primaryImage: resolvePrimaryImage(row.id, row.photos),
    currentRental,
  };
}

function toVehicleDetail(
  row: VehicleCardRow,
  currentRental: VehicleCard["currentRental"],
): VehicleDetail {
  const card = toVehicleCard(row, currentRental);
  return {
    ...card,
    gallery: row.photos.map((p) => toVehicleImage(row.id, p)),
  };
}

export function createVehiclesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: VEHICLE_CARD_INCLUDE,
    });
    if (!vehicle) throw AppError.notFound("Vehicle not found");
    return vehicle;
  }

  async function assertVinFree(vin: string, exceptId?: number) {
    const existing = await prisma.vehicle.findUnique({ where: { vin } });
    if (existing && existing.id !== exceptId) throw vinConflict();
  }

  async function assertExternalIdFree(externalId: string, exceptId?: number) {
    const existing = await prisma.vehicle.findUnique({ where: { externalId } });
    if (existing && existing.id !== exceptId) throw externalIdConflict();
  }

  async function assertPlateFree(plateNumber: string, exceptId?: number) {
    const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
    if (existing && existing.id !== exceptId) throw plateConflict();
  }

  /** A vehicle may only reference an EXISTING, ACTIVE vehicle model when modelId is set. */
  async function assertActiveModel(modelId: number) {
    const model = await prisma.vehicleModel.findUnique({
      where: { id: modelId },
      select: { id: true, isActive: true },
    });
    if (!model) throw invalidParentError("modelId");
    if (!model.isActive) throw inactiveReferenceError("modelId");
  }

  function throwOnUnique(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target)
        ? target.map(String)
        : typeof target === "string"
          ? [target]
          : [];
      if (fields.some((f) => f.toLowerCase().includes("vin"))) throw vinConflict();
      if (fields.some((f) => f.toLowerCase().includes("platenumber")))
        throw plateConflict();
      throw externalIdConflict();
    }
    throw err;
  }

  async function list(query: z.infer<typeof ListVehiclesQuerySchema>) {
    const vehicleTypeFilter = query.vehicleType
      ? {
          OR: [
            { vehicleName: { equals: query.vehicleType, mode: "insensitive" as const } },
            {
              vehicleName: null,
              model: {
                name: { equals: query.vehicleType, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {};

    const where: Prisma.VehicleWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.modelId !== undefined ? { modelId: query.modelId } : {}),
      ...vehicleTypeFilter,
      ...(query.status && query.status !== "all"
        ? { operationalStatus: operationalStatusFromDto(query.status) }
        : {}),
      ...(query.search
        ? {
            OR: [
              { vehicleName: { contains: query.search, mode: "insensitive" } },
              { vin: { contains: query.search, mode: "insensitive" } },
              { externalId: { contains: query.search, mode: "insensitive" } },
              { plateNumber: { contains: query.search, mode: "insensitive" } },
              { model: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const { field, direction } = parseSort(query.sort, VEHICLE_SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });
    const orderBy = buildVehicleListOrderBy(field, direction);
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.vehicle.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.vehicle.findMany({
          where,
          include: VEHICLE_CARD_INCLUDE,
          orderBy,
          skip,
          take,
        });
        const rentals = await loadCurrentRentalsByVehicleIds(
          prisma,
          rows.map((row) => row.id),
          {
            onDuplicate: (info) =>
              fastify.log.error(info, "multiple blocking contracts for vehicle"),
          },
        );
        return rows.map((row) => toVehicleCard(row, rentals.get(row.id) ?? null));
      },
    });
  }

  async function listFilterOptions(): Promise<FleetVehicleTypeOption[]> {
    const rows = await prisma.vehicle.findMany({
      where: { isActive: true },
      select: {
        vehicleName: true,
        model: { select: { name: true } },
      },
    });
    const byKey = new Map<string, string>();
    for (const row of rows) {
      const label = fleetVehicleTypeLabel(row.vehicleName, row.model?.name ?? null);
      if (!label) continue;
      const key = normalizeFleetTypeKey(label);
      if (!byKey.has(key)) byKey.set(key, label);
    }
    return [...byKey.values()]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((label) => ({ value: label, label }));
  }

  async function get(id: number): Promise<VehicleDetail> {
    const row = await loadOrThrow(id);
    const rentals = await loadCurrentRentalsByVehicleIds(prisma, [id], {
      onDuplicate: (info) =>
        fastify.log.error(info, "multiple blocking contracts for vehicle"),
    });
    return toVehicleDetail(row, rentals.get(id) ?? null);
  }

  async function create(
    input: z.infer<typeof CreateVehicleSchema>,
  ): Promise<VehiclePublic> {
    if (input.modelId != null) await assertActiveModel(input.modelId);
    const vehicleName = input.vehicleName ?? null;
    const vin = input.vin ? normalizeVin(input.vin) : null;
    if (vin) await assertVinFree(vin);
    const externalId = input.externalId ? normalizeExternalId(input.externalId) : null;
    if (externalId) await assertExternalIdFree(externalId);
    const plateNumber = input.plateNumber
      ? normalizePlateNumber(input.plateNumber)
      : null;
    if (plateNumber) await assertPlateFree(plateNumber);
    try {
      const row = await prisma.vehicle.create({
        data: {
          vehicleName,
          vin,
          modelId: input.modelId ?? null,
          modelYear: input.modelYear ?? null,
          color: input.color ?? null,
          plateNumber,
          dailyRate: input.dailyRate ?? null,
          monthlyRate: input.monthlyRate ?? null,
          operationalStatus: "AVAILABLE",
          externalId,
        },
        include: VEHICLE_CARD_INCLUDE,
      });
      return toVehiclePublic(row);
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function update(
    id: number,
    input: z.infer<typeof UpdateVehicleSchema>,
  ): Promise<VehiclePublic> {
    const existing = await loadOrThrow(id);
    await assertVehicleMutableForFleetOps(prisma, existing);
    const data: Prisma.VehicleUncheckedUpdateInput = {};

    if (input.vin !== undefined) {
      assertVinUnchanged(existing.vin, input.vin);
      const vin = input.vin ? normalizeVin(input.vin) : null;
      if (vin && vin !== existing.vin) await assertVinFree(vin, id);
      data.vin = vin;
    }
    if (input.vehicleName !== undefined) data.vehicleName = input.vehicleName;
    if (input.modelId !== undefined) {
      if (input.modelId !== null) await assertActiveModel(input.modelId);
      data.modelId = input.modelId;
    }
    if (input.modelYear !== undefined) data.modelYear = input.modelYear;
    if (input.color !== undefined) data.color = input.color;
    if (input.plateNumber !== undefined) {
      if (input.plateNumber !== null) {
        const plateNumber = normalizePlateNumber(input.plateNumber);
        if (plateNumber !== existing.plateNumber) await assertPlateFree(plateNumber, id);
        data.plateNumber = plateNumber;
      } else {
        data.plateNumber = null;
      }
    }
    if (input.dailyRate !== undefined) data.dailyRate = input.dailyRate;
    if (input.monthlyRate !== undefined) data.monthlyRate = input.monthlyRate;
    if (input.operationalStatus !== undefined) {
      data.operationalStatus = operationalStatusFromDto(input.operationalStatus);
    }
    if (input.externalId !== undefined) {
      if (input.externalId !== null) {
        const externalId = normalizeExternalId(input.externalId);
        await assertExternalIdFree(externalId, id);
        data.externalId = externalId;
      } else {
        data.externalId = null;
      }
    }
    try {
      const row = await prisma.vehicle.update({
        where: { id },
        data,
        include: VEHICLE_CARD_INCLUDE,
      });
      return toVehiclePublic(row);
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function setActive(id: number, isActive: boolean): Promise<VehiclePublic> {
    const existing = await loadOrThrow(id);
    if (!isActive) await assertVehicleMutableForFleetOps(prisma, existing);
    const row = await prisma.vehicle.update({
      where: { id },
      data: { isActive },
      include: VEHICLE_CARD_INCLUDE,
    });
    return toVehiclePublic(row);
  }

  return { list, listFilterOptions, get, create, update, setActive };
}
