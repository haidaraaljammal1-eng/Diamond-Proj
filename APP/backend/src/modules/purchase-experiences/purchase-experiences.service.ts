import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import {
  assertFieldUnchanged,
  conflictError,
  inactiveReferenceError,
  invalidParentError,
  normalizeExternalId,
} from "src/lib/master-data/code";
import type {
  CreatePurchaseExperienceSchema,
  ListPurchaseExperiencesQuerySchema,
  UpdatePurchaseExperienceSchema,
} from "src/modules/purchase-experiences/purchase-experiences.schema";

const EXPERIENCE_SORTABLE = ["purchaseDate", "deliveryDate", "createdAt"] as const;

function externalSaleIdConflict(): AppError {
  return conflictError(
    "purchase_experience",
    "externalSaleId",
    "A record with this external sale identifier already exists",
  );
}

function vinConflict(): AppError {
  return conflictError("vehicle", "vin", "A vehicle with this VIN already exists");
}

/**
 * Nested display projection for list/detail. One relation join per query (no
 * N+1) and each relation is `select`ed down to the lightweight display fields —
 * nothing sensitive, no duplicate storage.
 */
const EXPERIENCE_DISPLAY_INCLUDE = {
  customer: { select: { id: true, name: true } },
  vehicle: {
    select: {
      id: true,
      vin: true,
      modelYear: true,
      color: true,
      model: { select: { id: true, code: true, name: true } },
    },
  },
  branch: { select: { id: true, code: true, name: true } },
  salesperson: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PurchaseExperienceInclude;

export function createPurchaseExperiencesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number) {
    const experience = await prisma.purchaseExperience.findUnique({ where: { id } });
    if (!experience) throw AppError.notFound("Purchase experience not found");
    return experience;
  }

  async function assertActiveCustomer(id: number) {
    const row = await prisma.customer.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!row) throw invalidParentError("customerId");
    if (!row.isActive) throw inactiveReferenceError("customerId");
  }

  async function assertActiveVehicle(id: number) {
    const row = await prisma.vehicle.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!row) throw invalidParentError("vehicleId");
    if (!row.isActive) throw inactiveReferenceError("vehicleId");
  }

  async function assertActiveBranch(id: number) {
    const row = await prisma.branch.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!row) throw invalidParentError("branchId");
    if (!row.isActive) throw inactiveReferenceError("branchId");
  }

  async function assertActiveSalesperson(id: number) {
    const row = await prisma.salesperson.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!row) throw invalidParentError("salespersonId");
    if (!row.isActive) throw inactiveReferenceError("salespersonId");
  }

  async function assertExternalSaleIdFree(externalSaleId: string, exceptId?: number) {
    const existing = await prisma.purchaseExperience.findUnique({
      where: { externalSaleId },
    });
    if (existing && existing.id !== exceptId) throw externalSaleIdConflict();
  }

  async function list(query: z.infer<typeof ListPurchaseExperiencesQuerySchema>) {
    const purchaseDate = dateRange(query.purchaseDateFrom, query.purchaseDateTo);
    const deliveryDate = dateRange(query.deliveryDateFrom, query.deliveryDateTo);
    const where: Prisma.PurchaseExperienceWhereInput = {
      ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.salespersonId !== undefined ? { salespersonId: query.salespersonId } : {}),
      ...(query.vehicleModelId !== undefined
        ? { vehicle: { modelId: query.vehicleModelId } }
        : {}),
      ...(purchaseDate ? { purchaseDate } : {}),
      ...(deliveryDate ? { deliveryDate } : {}),
    };
    const { field, direction } = parseSort(query.sort, EXPERIENCE_SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.purchaseExperience.count({ where }),
      findMany: (skip, take) =>
        prisma.purchaseExperience.findMany({
          where,
          orderBy: {
            [field]: direction,
          } as Prisma.PurchaseExperienceOrderByWithRelationInput,
          skip,
          take,
          include: EXPERIENCE_DISPLAY_INCLUDE,
        }),
    });
  }

  async function get(id: number) {
    const experience = await prisma.purchaseExperience.findUnique({
      where: { id },
      include: EXPERIENCE_DISPLAY_INCLUDE,
    });
    if (!experience) throw AppError.notFound("Purchase experience not found");
    return experience;
  }

  /** Scalar experience columns shared by both create paths (vehicleId supplied). */
  function experienceData(
    input: z.infer<typeof CreatePurchaseExperienceSchema>,
    vehicleId: number,
    externalSaleId: string | null,
  ) {
    return {
      customerId: input.customerId,
      vehicleId,
      branchId: input.branchId,
      salespersonId: input.salespersonId ?? null,
      purchaseDate: input.purchaseDate ?? null,
      deliveryDate: input.deliveryDate ?? null,
      externalSaleId,
      financingType: input.financingType ?? null,
      insuranceType: input.insuranceType ?? null,
      salesChannel: input.salesChannel ?? null,
    };
  }

  function rethrowP2002(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : [];
      if (fields.some((f) => f.toLowerCase().includes("vin"))) throw vinConflict();
      throw externalSaleIdConflict();
    }
    throw err;
  }

  async function create(input: z.infer<typeof CreatePurchaseExperienceSchema>) {
    // Diamond has exactly ONE Vehicle creation source: Fleet → Add Vehicle, where
    // staff choose the operating company. A purchase experience therefore only ever
    // REFERENCES a fleet vehicle. The inline `vehicle` block stays in the schema and
    // is refused explicitly rather than dropped, so an old client gets a clear error
    // instead of a misleading success — the same convention as immutable `companyId`
    // on Vehicle update.
    if (input.vehicle != null) {
      throw AppError.validation(
        "A purchase experience cannot create a vehicle. Add it from the Vehicles page first, then send vehicleId.",
        { fields: ["vehicle"] },
      );
    }
    if (input.vehicleId == null) {
      throw AppError.validation("Provide the vehicleId of an existing fleet vehicle", {
        fields: ["vehicleId"],
      });
    }
    await assertActiveCustomer(input.customerId);
    await assertActiveBranch(input.branchId);
    if (input.salespersonId != null) await assertActiveSalesperson(input.salespersonId);
    const externalSaleId = input.externalSaleId
      ? normalizeExternalId(input.externalSaleId)
      : null;
    if (externalSaleId) await assertExternalSaleIdFree(externalSaleId);

    await assertActiveVehicle(input.vehicleId);
    try {
      return await prisma.purchaseExperience.create({
        data: experienceData(input, input.vehicleId, externalSaleId),
      });
    } catch (err) {
      rethrowP2002(err);
    }
  }

  async function update(
    id: number,
    input: z.infer<typeof UpdatePurchaseExperienceSchema>,
  ) {
    const existing = await loadOrThrow(id);
    assertFieldUnchanged("customerId", existing.customerId, input.customerId);
    assertFieldUnchanged("vehicleId", existing.vehicleId, input.vehicleId);

    const data: Prisma.PurchaseExperienceUncheckedUpdateInput = {};
    if (input.branchId !== undefined) {
      await assertActiveBranch(input.branchId);
      data.branchId = input.branchId;
    }
    if (input.salespersonId !== undefined) {
      if (input.salespersonId !== null) await assertActiveSalesperson(input.salespersonId);
      data.salespersonId = input.salespersonId;
    }
    if (input.purchaseDate !== undefined) data.purchaseDate = input.purchaseDate;
    if (input.deliveryDate !== undefined) data.deliveryDate = input.deliveryDate;
    if (input.financingType !== undefined) data.financingType = input.financingType;
    if (input.insuranceType !== undefined) data.insuranceType = input.insuranceType;
    if (input.salesChannel !== undefined) data.salesChannel = input.salesChannel;
    if (input.externalSaleId !== undefined) {
      if (input.externalSaleId !== null) {
        const externalSaleId = normalizeExternalId(input.externalSaleId);
        await assertExternalSaleIdFree(externalSaleId, id);
        data.externalSaleId = externalSaleId;
      } else {
        data.externalSaleId = null;
      }
    }
    try {
      return await prisma.purchaseExperience.update({ where: { id }, data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw externalSaleIdConflict();
      }
      throw err;
    }
  }

  return { list, get, create, update };
}

/** Build a Prisma date range filter from optional from/to bounds. */
function dateRange(
  from: Date | undefined,
  to: Date | undefined,
): Prisma.DateTimeNullableFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}
