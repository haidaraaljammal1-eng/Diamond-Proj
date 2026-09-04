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
  conflictError,
  duplicateCodeError,
  inactiveReferenceError,
  invalidParentError,
  normalizeCode,
  normalizeName,
} from "src/lib/master-data/code";
import type {
  CreateDepartmentSchema,
  ListDepartmentsQuerySchema,
  UpdateDepartmentSchema,
} from "src/modules/departments/departments.schema";

// Flatten the owning branch into the public projection ({ branchId, branchName }).
const deptInclude = { branch: { select: { id: true, name: true } } } as const;
type DeptRow = Prisma.DepartmentGetPayload<{ include: typeof deptInclude }>;
function toPublic(row: DeptRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDepartmentsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number): Promise<DeptRow> {
    const department = await prisma.department.findUnique({
      where: { id },
      include: deptInclude,
    });
    if (!department) throw AppError.notFound("Department not found");
    return department;
  }

  async function assertCodeFree(code: string, exceptId?: number) {
    const existing = await prisma.department.findUnique({ where: { code } });
    if (existing && existing.id !== exceptId) throw duplicateCodeError("department");
  }

  // The owning branch must exist and be active (a new department cannot join a
  // deactivated branch). Reused message keys match the master-data error contract.
  async function assertBranchAssignable(branchId: number) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });
    if (!branch) throw invalidParentError("branchId");
    if (!branch.isActive) throw inactiveReferenceError("branchId");
  }

  // Same business name may repeat across branches, never within one (see the
  // (branchId, normalizedName) unique index). Null-branch legacy rows are exempt
  // (nulls-distinct), so this only guards branch-scoped departments.
  async function assertNameFreeInBranch(
    branchId: number,
    normalizedName: string,
    exceptId?: number,
  ) {
    const existing = await prisma.department.findFirst({
      where: { branchId, normalizedName },
      select: { id: true },
    });
    if (existing && existing.id !== exceptId) {
      throw conflictError(
        "department",
        "name",
        "A department with this name already exists in the selected branch",
      );
    }
  }

  /** Mint a unique internal code when none was supplied (the code column is a
   *  unique key but no longer user-facing). */
  async function generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const code = `DEP-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await prisma.department.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    return `DEP-${Date.now().toString(36).toUpperCase()}`;
  }

  async function list(query: z.infer<typeof ListDepartmentsQuerySchema>) {
    const where: Prisma.DepartmentWhereInput = {
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
      count: () => prisma.department.count({ where }),
      findMany: (skip, take) =>
        prisma.department
          .findMany({
            where,
            include: deptInclude,
            orderBy: { [field]: direction } as Prisma.DepartmentOrderByWithRelationInput,
            skip,
            take,
          })
          .then((rows) => rows.map(toPublic)),
    });
  }

  async function get(id: number) {
    return toPublic(await loadOrThrow(id));
  }

  async function create(input: z.infer<typeof CreateDepartmentSchema>) {
    const code = input.code ? normalizeCode(input.code) : await generateUniqueCode();
    if (input.code) await assertCodeFree(code);
    await assertBranchAssignable(input.branchId);
    const normalizedName = normalizeName(input.name);
    await assertNameFreeInBranch(input.branchId, normalizedName);
    try {
      const row = await prisma.department.create({
        data: { code, name: input.name, branchId: input.branchId, normalizedName },
        include: deptInclude,
      });
      return toPublic(row);
    } catch (err) {
      // Either the code index or the (branchId, normalizedName) index; the explicit
      // pre-checks above make code the only remaining race, so report it as such.
      if (isUniqueViolation(err)) throw duplicateCodeError("department");
      throw err;
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateDepartmentSchema>) {
    const existing = await loadOrThrow(id);
    assertCodeUnchanged(existing.code, input.code);
    const data: Prisma.DepartmentUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
      const normalizedName = normalizeName(input.name);
      // Branch is immutable, so uniqueness is re-checked against the same branch.
      if (existing.branchId != null) {
        await assertNameFreeInBranch(existing.branchId, normalizedName, id);
      }
      data.normalizedName = normalizedName;
    }
    const row = await prisma.department.update({
      where: { id },
      data,
      include: deptInclude,
    });
    return toPublic(row);
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    const row = await prisma.department.update({
      where: { id },
      data: { isActive },
      include: deptInclude,
    });
    return toPublic(row);
  }

  return { list, get, create, update, setActive };
}
