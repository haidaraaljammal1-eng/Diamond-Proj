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
  CreateBranchSchema,
  ListBranchesQuerySchema,
  UpdateBranchSchema,
} from "src/modules/branches/branches.schema";

export function createBranchesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  const cityRef = {
    city: { select: { id: true, code: true, name: true } },
  } satisfies Prisma.BranchInclude;

  async function loadOrThrow(id: number) {
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: cityRef,
    });
    if (!branch) throw AppError.notFound("Branch not found");
    return branch;
  }

  async function assertCodeFree(code: string, exceptId?: number) {
    const existing = await prisma.branch.findUnique({ where: { code } });
    if (existing && existing.id !== exceptId) throw duplicateCodeError("branch");
  }

  /** Mint a unique internal code when the user left it blank. Kept because
   *  branches are an import key (`branchCode`); a supplied code still wins. */
  async function generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `BR-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await prisma.branch.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    return `BR-${Date.now().toString(36).toUpperCase()}`;
  }

  async function assertCity(cityId: number) {
    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true },
    });
    if (!city) throw invalidParentError("cityId");
  }

  async function list(query: z.infer<typeof ListBranchesQuerySchema>) {
    const where: Prisma.BranchWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.cityId !== undefined ? { cityId: query.cityId } : {}),
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
      count: () => prisma.branch.count({ where }),
      findMany: (skip, take) =>
        prisma.branch.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.BranchOrderByWithRelationInput,
          skip,
          take,
          include: cityRef,
        }),
    });
  }

  async function get(id: number) {
    return loadOrThrow(id);
  }

  async function create(input: z.infer<typeof CreateBranchSchema>) {
    const code = input.code ? normalizeCode(input.code) : await generateUniqueCode();
    if (input.code) await assertCodeFree(code);
    if (input.cityId !== undefined) await assertCity(input.cityId);
    try {
      return await prisma.branch.create({
        data: { code, name: input.name, cityId: input.cityId ?? null },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCodeError("branch");
      throw err;
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateBranchSchema>) {
    const existing = await loadOrThrow(id);
    assertCodeUnchanged(existing.code, input.code);
    const data: Prisma.BranchUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.cityId !== undefined) {
      if (input.cityId !== null) await assertCity(input.cityId);
      data.cityId = input.cityId;
    }
    return prisma.branch.update({ where: { id }, data });
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.branch.update({ where: { id }, data: { isActive } });
  }

  return { list, get, create, update, setActive };
}
