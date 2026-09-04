import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  MASTER_DATA_SORTABLE,
  assertCodeUnchanged,
  duplicateCodeError,
  invalidParentError,
  normalizeCode,
  normalizeExternalId,
} from "src/lib/master-data/code";
import type {
  CreateSalespersonSchema,
  ListSalespeopleQuerySchema,
  UpdateSalespersonSchema,
} from "src/modules/salespeople/salespeople.schema";

function externalIdConflict(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "A salesperson with this external ID already exists",
    conflicts: [
      {
        resource: "salesperson",
        field: "externalId",
        message: "A salesperson with this external ID already exists",
      },
    ],
  });
}

function userLinkConflict(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "This user is already linked to a salesperson",
    conflicts: [
      {
        resource: "salesperson",
        field: "userId",
        message: "This user is already linked to a salesperson",
      },
    ],
  });
}

export function createSalespeopleService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  // Lightweight parent references so list/detail render branch + linked-account
  // names without per-row lookups. User selects ONLY id/name/email — never the
  // password hash, roles or any other sensitive column.
  const relationsRef = {
    branch: { select: { id: true, code: true, name: true } },
    user: { select: { id: true, name: true, email: true } },
  } satisfies Prisma.SalespersonInclude;

  async function loadOrThrow(id: number) {
    const salesperson = await prisma.salesperson.findUnique({
      where: { id },
      include: relationsRef,
    });
    if (!salesperson) throw AppError.notFound("Salesperson not found");
    return salesperson;
  }

  async function assertCodeFree(code: string, exceptId?: number) {
    const existing = await prisma.salesperson.findUnique({ where: { code } });
    if (existing && existing.id !== exceptId) throw duplicateCodeError("salesperson");
  }

  /** Mint a unique internal code when the user/import didn't supply one. The code
   *  column stays populated (it's a unique key + a legacy import identity) but is
   *  no longer a user-facing field. */
  async function generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `SP-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await prisma.salesperson.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    return `SP-${Date.now().toString(36).toUpperCase()}`;
  }

  async function assertExternalIdFree(externalId: string, exceptId?: number) {
    const existing = await prisma.salesperson.findUnique({ where: { externalId } });
    if (existing && existing.id !== exceptId) throw externalIdConflict();
  }

  async function assertUser(userId: number, exceptId?: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw invalidParentError("userId");
    const linked = await prisma.salesperson.findUnique({ where: { userId } });
    if (linked && linked.id !== exceptId) throw userLinkConflict();
  }

  async function assertBranch(branchId: number) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) throw invalidParentError("branchId");
  }

  /** Backstop for races that slip past the pre-checks — map the unique index. */
  function throwOnUnique(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target)
        ? target.map(String)
        : typeof target === "string"
          ? [target]
          : [];
      const has = (needle: string) =>
        fields.some((f) => f.toLowerCase().includes(needle));
      if (has("externalid")) throw externalIdConflict();
      if (has("userid")) throw userLinkConflict();
      throw duplicateCodeError("salesperson");
    }
    throw err;
  }

  async function list(query: z.infer<typeof ListSalespeopleQuerySchema>) {
    const where: Prisma.SalespersonWhereInput = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { externalId: { contains: query.search, mode: "insensitive" } },
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
      count: () => prisma.salesperson.count({ where }),
      findMany: (skip, take) =>
        prisma.salesperson.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.SalespersonOrderByWithRelationInput,
          skip,
          take,
          include: relationsRef,
        }),
    });
  }

  async function get(id: number) {
    return loadOrThrow(id);
  }

  async function create(input: z.infer<typeof CreateSalespersonSchema>) {
    // Code is optional from the UI now — mint one internally when absent. Only a
    // user/import-supplied code needs the pre-check (a minted one is already free).
    const code = input.code ? normalizeCode(input.code) : await generateUniqueCode();
    if (input.code) await assertCodeFree(code);
    const externalId = input.externalId ? normalizeExternalId(input.externalId) : null;
    if (externalId) await assertExternalIdFree(externalId);
    if (input.userId != null) await assertUser(input.userId);
    if (input.branchId != null) await assertBranch(input.branchId);
    try {
      return await prisma.salesperson.create({
        data: {
          code,
          name: input.name,
          externalId,
          userId: input.userId ?? null,
          branchId: input.branchId ?? null,
        },
      });
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateSalespersonSchema>) {
    const existing = await loadOrThrow(id);
    assertCodeUnchanged(existing.code, input.code);
    const data: Prisma.SalespersonUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.externalId !== undefined) {
      if (input.externalId !== null) {
        const externalId = normalizeExternalId(input.externalId);
        await assertExternalIdFree(externalId, id);
        data.externalId = externalId;
      } else {
        data.externalId = null;
      }
    }
    if (input.userId !== undefined) {
      if (input.userId !== null) await assertUser(input.userId, id);
      data.userId = input.userId;
    }
    if (input.branchId !== undefined) {
      if (input.branchId !== null) await assertBranch(input.branchId);
      data.branchId = input.branchId;
    }
    try {
      return await prisma.salesperson.update({ where: { id }, data });
    } catch (err) {
      throwOnUnique(err);
    }
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.salesperson.update({ where: { id }, data: { isActive } });
  }

  return { list, get, create, update, setActive };
}
