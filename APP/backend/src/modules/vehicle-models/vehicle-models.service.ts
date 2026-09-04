import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  MASTER_DATA_SORTABLE,
  assertCodeUnchanged,
  duplicateCodeError,
  normalizeCode,
} from "src/lib/master-data/code";
import type {
  CreateVehicleModelSchema,
  ListVehicleModelsQuerySchema,
  UpdateVehicleModelSchema,
} from "src/modules/vehicle-models/vehicle-models.schema";

export function createVehicleModelsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number) {
    const model = await prisma.vehicleModel.findUnique({ where: { id } });
    if (!model) throw AppError.notFound("Vehicle model not found");
    return model;
  }

  async function assertCodeFree(code: string, exceptId?: number) {
    const existing = await prisma.vehicleModel.findUnique({ where: { code } });
    if (existing && existing.id !== exceptId) throw duplicateCodeError("vehicle_model");
  }

  /** Mint a unique internal code when the user left it blank. Kept because models
   *  are an import key (`vehicleModelCode`); a supplied code still wins. */
  async function generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `MDL-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await prisma.vehicleModel.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    return `MDL-${Date.now().toString(36).toUpperCase()}`;
  }

  async function list(query: z.infer<typeof ListVehicleModelsQuerySchema>) {
    const where: Prisma.VehicleModelWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { field, direction } = parseSort(query.sort, MASTER_DATA_SORTABLE, {
      field: "name",
      direction: "asc",
    });
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.vehicleModel.count({ where }),
      findMany: (skip, take) =>
        prisma.vehicleModel.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.VehicleModelOrderByWithRelationInput,
          skip,
          take,
        }),
    });
  }

  async function get(id: number) {
    return loadOrThrow(id);
  }

  async function create(input: z.infer<typeof CreateVehicleModelSchema>) {
    const code = input.code ? normalizeCode(input.code) : await generateUniqueCode();
    if (input.code) await assertCodeFree(code);
    try {
      return await prisma.vehicleModel.create({
        data: { code, name: input.name, modelYear: input.modelYear ?? null },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCodeError("vehicle_model");
      throw err;
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateVehicleModelSchema>) {
    const existing = await loadOrThrow(id);
    assertCodeUnchanged(existing.code, input.code);
    const data: Prisma.VehicleModelUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.modelYear !== undefined) data.modelYear = input.modelYear;
    return prisma.vehicleModel.update({ where: { id }, data });
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.vehicleModel.update({ where: { id }, data: { isActive } });
  }

  return { list, get, create, update, setActive };
}
