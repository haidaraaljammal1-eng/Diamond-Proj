import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  conflictError,
  inactiveReferenceError,
  invalidParentError,
  normalizeExternalId,
  normalizeVin,
} from "src/lib/master-data/code";
import type {
  CreateVehicleSchema,
  ListVehiclesQuerySchema,
  UpdateVehicleSchema,
} from "src/modules/vehicles/vehicles.schema";

const VEHICLE_SORTABLE = ["vin", "modelYear", "createdAt", "isActive"] as const;

function vinConflict(): AppError {
  return conflictError("vehicle", "vin", "A vehicle with this VIN already exists");
}
function externalIdConflict(): AppError {
  return conflictError("vehicle", "externalId", "This external identifier is already in use");
}

export function createVehiclesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
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
      throw externalIdConflict();
    }
    throw err;
  }

  async function list(query: z.infer<typeof ListVehiclesQuerySchema>) {
    const where: Prisma.VehicleWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.modelId !== undefined ? { modelId: query.modelId } : {}),
      ...(query.search
        ? {
            OR: [
              { vin: { contains: query.search, mode: "insensitive" } },
              { externalId: { contains: query.search, mode: "insensitive" } },
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
      findMany: (skip, take) =>
        prisma.vehicle.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.VehicleOrderByWithRelationInput,
          skip,
          take,
        }),
    });
  }

  async function get(id: number) {
    return loadOrThrow(id);
  }

  async function create(input: z.infer<typeof CreateVehicleSchema>) {
    await assertActiveModel(input.modelId);
    const vin = input.vin ? normalizeVin(input.vin) : null;
    if (vin) await assertVinFree(vin);
    const externalId = input.externalId ? normalizeExternalId(input.externalId) : null;
    if (externalId) await assertExternalIdFree(externalId);
    try {
      return await prisma.vehicle.create({
        data: {
          vin,
          modelId: input.modelId,
          modelYear: input.modelYear ?? null,
          color: input.color ?? null,
          externalId,
        },
      });
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateVehicleSchema>) {
    const existing = await loadOrThrow(id);
    const data: Prisma.VehicleUncheckedUpdateInput = {};
    // VIN is editable — this is not a vehicle registry,
    // and correcting a chassis number must not be blocked. A change is allowed as
    // long as the new VIN is not already taken by another vehicle; an omitted `vin`
    // leaves it untouched.
    if (input.vin !== undefined) {
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
      return await prisma.vehicle.update({ where: { id }, data });
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.vehicle.update({ where: { id }, data: { isActive } });
  }

  return { list, get, create, update, setActive };
}
