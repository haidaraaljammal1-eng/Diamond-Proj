import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type {
  CityLookupQuery,
  RegionLookupQuery,
  BranchLookupQuery,
  VehicleModelLookupQuery,
  DepartmentLookupQuery,
  SalespersonLookupQuery,
  CustomerLookupQuery,
  VehicleLookupQuery,
  UserLookupQuery,
  RoleLookupQuery,
  PurchaseExperienceLookupQuery,
  CommunicationTemplateLookupQuery,
} from "src/modules/lookups/lookups.schema";

/** Case-insensitive code+name search fragment shared by every lookup. */
function searchOr(search: string | undefined) {
  return search
    ? {
        OR: [
          { code: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
}

export function createLookupsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function regions(query: z.infer<typeof RegionLookupQuery>) {
    const where: Prisma.RegionWhereInput = { isActive: true, ...searchOr(query.search) };
    const rows = await prisma.region.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, code: r.code }));
  }

  async function cities(query: z.infer<typeof CityLookupQuery>) {
    const where: Prisma.CityWhereInput = {
      isActive: true,
      ...(query.regionId !== undefined ? { regionId: query.regionId } : {}),
      ...searchOr(query.search),
    };
    const rows = await prisma.city.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true, regionId: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, code: r.code, regionId: r.regionId }));
  }

  async function branches(query: z.infer<typeof BranchLookupQuery>) {
    const where: Prisma.BranchWhereInput = { isActive: true, ...searchOr(query.search) };
    const rows = await prisma.branch.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, code: r.code }));
  }

  async function vehicleModels(query: z.infer<typeof VehicleModelLookupQuery>) {
    const where: Prisma.VehicleModelWhereInput = {
      isActive: true,
      ...searchOr(query.search),
    };
    const rows = await prisma.vehicleModel.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true, modelYear: true },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.name,
      code: r.code,
      modelYear: r.modelYear,
    }));
  }

  async function departments(query: z.infer<typeof DepartmentLookupQuery>) {
    const where: Prisma.DepartmentWhereInput = {
      isActive: true,
      ...(query.ids !== undefined ? { id: { in: query.ids } } : {}),
      ...searchOr(query.search),
    };
    const rows = await prisma.department.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, code: r.code }));
  }

  async function salespeople(query: z.infer<typeof SalespersonLookupQuery>) {
    const where: Prisma.SalespersonWhereInput = {
      isActive: true,
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...searchOr(query.search),
    };
    const rows = await prisma.salesperson.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true, branchId: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, code: r.code, branchId: r.branchId }));
  }

  async function customers(query: z.infer<typeof CustomerLookupQuery>) {
    const search = query.search;
    const where: Prisma.CustomerWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { mobile: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { externalId: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, externalId: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, externalId: r.externalId }));
  }

  async function vehicles(query: z.infer<typeof VehicleLookupQuery>) {
    const search = query.search;
    const where: Prisma.VehicleWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { vin: { contains: search, mode: "insensitive" } },
              { externalId: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: { id: true, vin: true, model: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, label: r.vin ?? r.model.name, vin: r.vin }));
  }

  async function users(query: z.infer<typeof UserLookupQuery>) {
    const search = query.search;
    const where: Prisma.UserWhereInput = {
      // Only accounts that can authenticate — active users belong in pickers.
      // An id→label resolve is the ONE case that must also reach a deactivated
      // account: a rule saved yesterday may name someone who has since been
      // disabled, and showing "#42" instead of their name would hide the problem
      // the screen exists to surface.
      ...(query.ids !== undefined ? { id: { in: query.ids } } : { status: "ACTIVE" }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      // Never expose password hashes, roles or any sensitive column. The single
      // department assignment (manager-of first, else earliest) is included so a
      // picker can show "Name — Department" without a second request — one nested
      // read, batched by Prisma, not a per-row query.
      select: {
        id: true,
        name: true,
        email: true,
        departmentAssignments: {
          orderBy: [{ isManager: "desc" }, { id: "asc" }],
          take: 1,
          select: { department: { select: { name: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.name ?? r.email,
      email: r.email,
      department: r.departmentAssignments[0]?.department.name ?? null,
    }));
  }

  async function roles(query: z.infer<typeof RoleLookupQuery>) {
    const search = query.search;
    // Role has no `isActive`; system roles are still assignable, so include every
    // role and filter only by the machine `key` / display `name` search.
    const where: Prisma.RoleWhereInput = search
      ? {
          OR: [
            { key: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    const rows = await prisma.role.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, key: true },
    });
    return rows.map((r) => ({ id: r.id, label: r.name, code: r.key }));
  }

  async function purchaseExperiences(
    query: z.infer<typeof PurchaseExperienceLookupQuery>,
  ) {
    const search = query.search;
    // Contextual picker for the complaint-create flow (customer chosen first, so
    // narrowed by customerId). PurchaseExperience has no `isActive` flag; branch
    // scope is not plumbed here — the customer narrowing is the guard.
    const where: Prisma.PurchaseExperienceWhereInput = {
      ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
      ...(search
        ? {
            OR: [
              { externalSaleId: { contains: search, mode: "insensitive" } },
              { vehicle: { vin: { contains: search, mode: "insensitive" } } },
              { vehicle: { model: { name: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const rows = await prisma.purchaseExperience.findMany({
      where,
      orderBy: { purchaseDate: "desc" },
      take: query.limit,
      select: {
        id: true,
        purchaseDate: true,
        externalSaleId: true,
        vehicle: { select: { model: { select: { name: true } } } },
      },
    });
    return rows.map((r) => {
      const modelName = r.vehicle.model.name;
      const date = r.purchaseDate ? r.purchaseDate.toISOString().slice(0, 10) : null;
      const label = date ? `${modelName} — ${date}` : (r.externalSaleId ?? modelName);
      return { id: r.id, label };
    });
  }

  async function communicationTemplates(
    query: z.infer<typeof CommunicationTemplateLookupQuery>,
  ) {
    // Only PUBLISHED templates are selectable, optionally filtered to a channel so a
    // campaign step only ever offers channel-matching published templates.
    const where: Prisma.MessageTemplateWhereInput = {
      isActive: true,
      currentVersionId: { not: null },
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
      ...searchOr(query.search),
    };
    const rows = await prisma.messageTemplate.findMany({
      where,
      orderBy: { name: "asc" },
      take: query.limit,
      select: { id: true, name: true, code: true, channel: true, currentVersionId: true },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.name,
      code: r.code,
      channel: r.channel,
      currentVersionId: r.currentVersionId as number,
    }));
  }

  return {
    regions,
    cities,
    branches,
    vehicleModels,
    departments,
    salespeople,
    customers,
    vehicles,
    users,
    roles,
    purchaseExperiences,
    communicationTemplates,
  };
}
