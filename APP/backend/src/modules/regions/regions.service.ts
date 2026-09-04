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
  CreateRegionSchema,
  ListRegionsQuerySchema,
  UpdateRegionSchema,
} from "src/modules/regions/regions.schema";

export function createRegionsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number) {
    const region = await prisma.region.findUnique({ where: { id } });
    if (!region) throw AppError.notFound("Region not found");
    return region;
  }

  async function assertCodeFree(code: string, exceptId?: number) {
    const existing = await prisma.region.findUnique({ where: { code } });
    if (existing && existing.id !== exceptId) throw duplicateCodeError("region");
  }

  /** Mint a unique internal code when none was supplied (the code column is a
   *  unique key but no longer user-facing). */
  async function generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `REG-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await prisma.region.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    return `REG-${Date.now().toString(36).toUpperCase()}`;
  }

  async function list(query: z.infer<typeof ListRegionsQuerySchema>) {
    const where: Prisma.RegionWhereInput = {
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
      count: () => prisma.region.count({ where }),
      findMany: (skip, take) =>
        prisma.region.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.RegionOrderByWithRelationInput,
          skip,
          take,
        }),
    });
  }

  async function get(id: number) {
    return loadOrThrow(id);
  }

  async function create(input: z.infer<typeof CreateRegionSchema>) {
    const code = input.code ? normalizeCode(input.code) : await generateUniqueCode();
    if (input.code) await assertCodeFree(code);
    try {
      return await prisma.region.create({ data: { code, name: input.name } });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCodeError("region");
      throw err;
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateRegionSchema>) {
    const existing = await loadOrThrow(id);
    assertCodeUnchanged(existing.code, input.code);
    const data: Prisma.RegionUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    return prisma.region.update({ where: { id }, data });
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.region.update({ where: { id }, data: { isActive } });
  }

  return { list, get, create, update, setActive };
}
