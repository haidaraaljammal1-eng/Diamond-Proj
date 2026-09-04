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
  invalidParentError,
  normalizeCode,
} from "src/lib/master-data/code";
import type {
  CreateCitySchema,
  ListCitiesQuerySchema,
  UpdateCitySchema,
} from "src/modules/cities/cities.schema";

export function createCitiesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  const regionRef = {
    region: { select: { id: true, code: true, name: true } },
  } satisfies Prisma.CityInclude;

  async function loadOrThrow(id: number) {
    const city = await prisma.city.findUnique({
      where: { id },
      include: regionRef,
    });
    if (!city) throw AppError.notFound("City not found");
    return city;
  }

  async function assertCodeFree(code: string, exceptId?: number) {
    const existing = await prisma.city.findUnique({ where: { code } });
    if (existing && existing.id !== exceptId) throw duplicateCodeError("city");
  }

  /** Mint a unique internal code when none was supplied (the code column is a
   *  unique key but no longer user-facing). */
  async function generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `CITY-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await prisma.city.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    return `CITY-${Date.now().toString(36).toUpperCase()}`;
  }

  async function assertRegion(regionId: number) {
    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!region) throw invalidParentError("regionId");
  }

  async function list(query: z.infer<typeof ListCitiesQuerySchema>) {
    const where: Prisma.CityWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.regionId !== undefined ? { regionId: query.regionId } : {}),
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
      count: () => prisma.city.count({ where }),
      findMany: (skip, take) =>
        prisma.city.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.CityOrderByWithRelationInput,
          skip,
          take,
          include: regionRef,
        }),
    });
  }

  async function get(id: number) {
    return loadOrThrow(id);
  }

  async function create(input: z.infer<typeof CreateCitySchema>) {
    const code = input.code ? normalizeCode(input.code) : await generateUniqueCode();
    if (input.code) await assertCodeFree(code);
    await assertRegion(input.regionId);
    try {
      return await prisma.city.create({
        data: { code, name: input.name, regionId: input.regionId },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCodeError("city");
      throw err;
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateCitySchema>) {
    const existing = await loadOrThrow(id);
    assertCodeUnchanged(existing.code, input.code);
    const data: Prisma.CityUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.regionId !== undefined) {
      await assertRegion(input.regionId);
      data.region = { connect: { id: input.regionId } };
    }
    return prisma.city.update({ where: { id }, data });
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.city.update({ where: { id }, data: { isActive } });
  }

  return { list, get, create, update, setActive };
}
