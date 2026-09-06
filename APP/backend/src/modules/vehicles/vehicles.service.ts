import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
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
  resolveCurrentRental,
  resolvePrimaryImage,
  toVehicleImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";
import type {
  CreateVehicleSchema,
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
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: { attachment: { select: { mimeType: true } } },
  },
} satisfies Prisma.VehicleInclude;

type VehicleCardRow = Prisma.VehicleGetPayload<{ include: typeof VEHICLE_CARD_INCLUDE }>;

function vinConflict(): AppError {
  return conflictError("vehicle", "vin", "A vehicle with this VIN already exists");
}
function externalIdConflict(): AppError {
  return conflictError("vehicle", "externalId", "This external identifier is already in use");
}
function plateConflict(): AppError {
  return conflictError("vehicle", "plateNumber", "A vehicle with this plate number already exists");
}

function toVehiclePublic(row: VehicleCardRow): VehiclePublic {
  return {
    id: row.id,
    vin: row.vin,
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

function toVehicleCard(row: VehicleCardRow): VehicleCard {
  return {
    ...toVehiclePublic(row),
    displayName: vehicleDisplayName(row.model.name, row.modelYear),
    model: row.model,
    primaryImage: resolvePrimaryImage(row.id, row.photos),
    currentRental: resolveCurrentRental(row.id),
  };
}

function toVehicleDetail(row: VehicleCardRow): VehicleDetail {
  const card = toVehicleCard(row);
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

  /** A NEW vehicle may only reference an EXISTING, ACTIVE vehicle model. */
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
      if (fields.some((f) => f.toLowerCase().includes("platenumber"))) throw plateConflict();
      throw externalIdConflict();
    }
    throw err;
  }

  async function list(query: z.infer<typeof ListVehiclesQuerySchema>) {
    const where: Prisma.VehicleWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.modelId !== undefined ? { modelId: query.modelId } : {}),
      ...(query.status && query.status !== "all"
        ? { operationalStatus: operationalStatusFromDto(query.status) }
        : {}),
      ...(query.search
        ? {
            OR: [
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
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.vehicle.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.vehicle.findMany({
          where,
          include: VEHICLE_CARD_INCLUDE,
          orderBy: { [field]: direction } as Prisma.VehicleOrderByWithRelationInput,
          skip,
          take,
        });
        return rows.map(toVehicleCard);
      },
    });
  }

  async function get(id: number): Promise<VehicleDetail> {
    return toVehicleDetail(await loadOrThrow(id));
  }

  async function create(input: z.infer<typeof CreateVehicleSchema>): Promise<VehiclePublic> {
    await assertActiveModel(input.modelId);
    const vin = input.vin ? normalizeVin(input.vin) : null;
    if (vin) await assertVinFree(vin);
    const externalId = input.externalId ? normalizeExternalId(input.externalId) : null;
    if (externalId) await assertExternalIdFree(externalId);
    const plateNumber = input.plateNumber ? normalizePlateNumber(input.plateNumber) : null;
    if (plateNumber) await assertPlateFree(plateNumber);
    try {
      const row = await prisma.vehicle.create({
        data: {
          vin,
          modelId: input.modelId,
          modelYear: input.modelYear ?? null,
          color: input.color ?? null,
          plateNumber,
          dailyRate: input.dailyRate ?? null,
          monthlyRate: input.monthlyRate ?? null,
          operationalStatus: input.operationalStatus
            ? operationalStatusFromDto(input.operationalStatus)
            : undefined,
          externalId,
        },
        include: VEHICLE_CARD_INCLUDE,
      });
      return toVehiclePublic(row);
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateVehicleSchema>): Promise<VehiclePublic> {
    const existing = await loadOrThrow(id);
    const data: Prisma.VehicleUncheckedUpdateInput = {};

    if (input.vin !== undefined) {
      assertVinUnchanged(existing.vin, input.vin);
      const vin = input.vin ? normalizeVin(input.vin) : null;
      if (vin && vin !== existing.vin) await assertVinFree(vin, id);
      data.vin = vin;
    }
    if (input.modelId !== undefined) {
      await assertActiveModel(input.modelId);
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
    await loadOrThrow(id);
    const row = await prisma.vehicle.update({
      where: { id },
      data: { isActive },
      include: VEHICLE_CARD_INCLUDE,
    });
    return toVehiclePublic(row);
  }

  return { list, get, create, update, setActive };
}
