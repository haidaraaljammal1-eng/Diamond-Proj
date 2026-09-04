import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import type { PageMeta } from "src/lib/http/response";
import { conflictError, normalizeExternalId } from "src/lib/master-data/code";
import { normalizeEmail, normalizePhone } from "src/lib/security/normalize";
import type { AuthUser } from "src/lib/context/auth-context";
import {
  customerScopeWhere,
  resolveCustomerScope,
} from "src/modules/customers/customer-scope";
import type {
  CreateCustomerSchema,
  Customer360,
  CustomerListItem,
  ListCustomersQuerySchema,
  UpdateCustomerSchema,
} from "src/modules/customers/customers.schema";

/** Distinct, non-empty names preserving first-seen order (for the row "+N" lists). */
function uniqNames(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

const EMPTY_SALES: NonNullable<CustomerListItem["sales"]> = {
  experienceCount: 0,
  latest: null,
  branches: [],
  salespeople: [],
  vins: [],
};

const CUSTOMER_SORTABLE = ["name", "createdAt", "isActive"] as const;


function externalIdConflict(): AppError {
  return conflictError("customer", "externalId", "This external identifier is already in use");
}

export function createCustomersService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  // Write paths (update / setActive) still resolve the customer WITHOUT branch
  // scoping. That is a known, deliberate boundary of this pass: `customers.manage`
  // is a strictly higher grant than `customers.read`, and scoping the mutation paths
  // is a separate change with its own test surface. The READ paths below are the
  // ones that leaked and are all gated through customer-scope.ts.
  async function loadOrThrow(id: number) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw AppError.notFound("Customer not found");
    return customer;
  }

  /** Load a customer for a READ, enforcing the shared branch-visibility rule.
   *  Out-of-scope is indistinguishable from non-existent (404, never 403). */
  async function loadVisibleOrThrow(id: number, viewer: AuthUser) {
    const scope = await resolveCustomerScope(prisma, viewer);
    const customer = await prisma.customer.findFirst({
      where: { id, ...customerScopeWhere(scope) },
    });
    if (!customer) throw AppError.notFound("Customer not found");
    return customer;
  }

  async function assertExternalIdFree(externalId: string, exceptId?: number) {
    const existing = await prisma.customer.findUnique({ where: { externalId } });
    if (existing && existing.id !== exceptId) throw externalIdConflict();
  }

  // Batch-load the sales rollup for a whole page of customers in ONE query
  // (WHERE customerId IN (ids)) — never a query per customer. Latest sale is
  // picked by the same composite recency key the 360 uses (deliveryDate ??
  // purchaseDate ?? createdAt), resolved here so the client never re-sorts.
  async function loadSalesSummaries(
    ids: number[],
  ): Promise<Map<number, NonNullable<CustomerListItem["sales"]>>> {
    const experiences = await prisma.purchaseExperience.findMany({
      where: { customerId: { in: ids } },
      select: {
        customerId: true,
        deliveryDate: true,
        purchaseDate: true,
        createdAt: true,
        vehicle: {
          select: { vin: true, modelYear: true, model: { select: { name: true } } },
        },
        branch: { select: { name: true } },
        salesperson: { select: { name: true } },
      },
    });
    const byCustomer = new Map<number, typeof experiences>();
    for (const e of experiences) {
      const arr = byCustomer.get(e.customerId);
      if (arr) arr.push(e);
      else byCustomer.set(e.customerId, [e]);
    }
    const recency = (e: (typeof experiences)[number]) =>
      (e.deliveryDate ?? e.purchaseDate ?? e.createdAt).getTime();
    const result = new Map<number, NonNullable<CustomerListItem["sales"]>>();
    for (const [customerId, group] of byCustomer) {
      const latest = group.reduce((a, b) => (recency(b) > recency(a) ? b : a));
      result.set(customerId, {
        experienceCount: group.length,
        latest: {
          deliveryDate: latest.deliveryDate,
          vehicleModel: latest.vehicle.model?.name ?? null,
          vehicleModelYear: latest.vehicle.modelYear,
          vin: latest.vehicle.vin,
          branch: latest.branch?.name ?? null,
          salesperson: latest.salesperson?.name ?? null,
        },
        branches: uniqNames(group.map((e) => e.branch?.name)),
        salespeople: uniqNames(group.map((e) => e.salesperson?.name)),
        vins: uniqNames(group.map((e) => e.vehicle.vin)),
      });
    }
    return result;
  }

  async function list(
    query: z.infer<typeof ListCustomersQuerySchema>,
    caps: { canSales: boolean },
    viewer: AuthUser,
  ): Promise<{ data: CustomerListItem[]; meta: PageMeta }> {
    // Branch visibility is applied to the QUERY, not to the page after the fact, so
    // `meta.total` and the pagination the client sees are the scoped truth — an
    // out-of-branch customer never occupies a row or inflates a count.
    const scope = await resolveCustomerScope(prisma, viewer);
    // Branch FILTER (`?branchId=`) and branch SCOPE both constrain the SAME relation
    // (`experiences.some.branchId`), so they are combined with AND — a spread would let
    // the filter's `experiences` key overwrite the scope's and leak out-of-scope
    // customers. `customerScopeWhere` is `{}` for a global viewer, so `AND:[{}, filter]`
    // narrows correctly; for a scoped viewer the two `some` predicates intersect
    // (visible AND has a sale at the chosen branch). `{}` when no branch is picked.
    const branchFilter: Prisma.CustomerWhereInput = query.branchId
      ? { experiences: { some: { branchId: query.branchId } } }
      : {};
    const where: Prisma.CustomerWhereInput = {
      AND: [customerScopeWhere(scope), branchFilter],
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { mobile: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { externalId: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { field, direction } = parseSort(query.sort, CUSTOMER_SORTABLE, {
      field: "name",
      direction: "asc",
    });
    const { data: rows, meta } = await paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.customer.count({ where }),
      findMany: (skip, take) =>
        prisma.customer.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.CustomerOrderByWithRelationInput,
          skip,
          take,
        }),
    });

    // Enrich the page in a FIXED number of queries (at most 2 batch reads,
    // regardless of page size) — this replaces the client's former per-row
    // /purchase-experiences fan-out (the N+1). Each block is
    // permission-tiered so the projection never exposes data the caller can't read.
    const ids = rows.map((r) => r.id);
    const salesById =
      caps.canSales && ids.length > 0
        ? await loadSalesSummaries(ids)
        : new Map<number, NonNullable<CustomerListItem["sales"]>>();

    const data: CustomerListItem[] = rows.map((c) => ({
      ...c,
      sales: caps.canSales ? (salesById.get(c.id) ?? EMPTY_SALES) : null,
    }));
    return { data, meta };
  }

  async function get(id: number, viewer: AuthUser) {
    return loadVisibleOrThrow(id, viewer);
  }

  async function create(input: z.infer<typeof CreateCustomerSchema>) {
    const externalId = input.externalId ? normalizeExternalId(input.externalId) : null;
    if (externalId) await assertExternalIdFree(externalId);
    try {
      return await prisma.customer.create({
        data: {
          name: input.name,
          mobile: input.mobile ? normalizePhone(input.mobile) : null,
          email: input.email ? normalizeEmail(input.email) : null,
          type: input.type,
          optOutEmail: input.optOutEmail,
          optOutSms: input.optOutSms,
          optOutPhone: input.optOutPhone,
          optOutWhatsApp: input.optOutWhatsApp,
          externalId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw externalIdConflict();
      throw err;
    }
  }

  async function update(id: number, input: z.infer<typeof UpdateCustomerSchema>) {
    await loadOrThrow(id);
    const data: Prisma.CustomerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.optOutEmail !== undefined) data.optOutEmail = input.optOutEmail;
    if (input.optOutSms !== undefined) data.optOutSms = input.optOutSms;
    if (input.optOutPhone !== undefined) data.optOutPhone = input.optOutPhone;
    if (input.optOutWhatsApp !== undefined) data.optOutWhatsApp = input.optOutWhatsApp;
    if (input.mobile !== undefined)
      data.mobile = input.mobile !== null ? normalizePhone(input.mobile) : null;
    if (input.email !== undefined)
      data.email = input.email !== null ? normalizeEmail(input.email) : null;
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
      return await prisma.customer.update({ where: { id }, data });
    } catch (err) {
      if (isUniqueViolation(err)) throw externalIdConflict();
      throw err;
    }
  }

  async function setActive(id: number, isActive: boolean) {
    await loadOrThrow(id);
    return prisma.customer.update({ where: { id }, data: { isActive } });
  }

  /**
   * Customer 360 — a derived read projection aggregated from authoritative
   * sources (never persisted). The call-center section is real, bounded
   * aggregates (no N+1). The complaint section stays absent until Phase 4.
   */
  async function customer360(id: number, viewer: AuthUser): Promise<Customer360> {
    // Same visibility rule as the list — folded into the SAME query, so there is no
    // window where the 360 loads a customer the list would have hidden.
    const scope = await resolveCustomerScope(prisma, viewer);
    const customer = await prisma.customer.findFirst({
      where: { id, ...customerScopeWhere(scope) },
      include: {
        experiences: {
          orderBy: { createdAt: "desc" },
          include: {
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
          },
        },
      },
    });
    if (!customer) throw AppError.notFound("Customer not found");
    const { experiences, ...basic } = customer;

    // Latest experience by composite recency (deliveryDate ?? purchaseDate ??
    // createdAt), resolved here so the client renders "latest" without re-sorting.
    const recencyKey = (e: (typeof experiences)[number]) =>
      (e.deliveryDate ?? e.purchaseDate ?? e.createdAt).getTime();
    const latestExperienceId = experiences.reduce<{ id: number; key: number } | null>(
      (best, e) => {
        const key = recencyKey(e);
        return best === null || key > best.key ? { id: e.id, key } : best;
      },
      null,
    )?.id ?? null;

    // Real call-center SUMMARY (bounded aggregates — no N+1). Deliberately a summary
    // and not a per-call list.
    const [totalCalls, latestCall, pendingCallback, unreachableCount] = await Promise.all([
      prisma.callSession.count({ where: { queueItem: { customerId: id } } }),
      prisma.callSession.findFirst({ where: { queueItem: { customerId: id } }, orderBy: { startedAt: "desc" }, select: { startedAt: true, outcome: true } }),
      prisma.callCallback.findFirst({ where: { queueItem: { customerId: id }, status: { in: ["SCHEDULED", "DUE"] } }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
      prisma.callCenterQueueItem.count({ where: { customerId: id, status: "UNREACHABLE" } }),
    ]);

    // Real complaint summary + bounded history (no N+1).
    const [openComplaintsCount, latestComplaint, complaintsHistory] = await Promise.all([
      prisma.complaint.count({ where: { customerId: id, lifecycleStatus: "OPEN" } }),
      prisma.complaint.findFirst({ where: { customerId: id }, orderBy: { openedAt: "desc" }, select: { publicNumber: true, stage: true, priority: true, openedAt: true, closedAt: true, category: { select: { nameAr: true, nameEn: true } }, department: { select: { name: true } } } }),
      prisma.complaint.findMany({ where: { customerId: id }, orderBy: { openedAt: "desc" }, take: 10, select: { id: true, publicNumber: true, stage: true, priority: true, lifecycleStatus: true, openedAt: true, category: { select: { nameAr: true, nameEn: true } }, department: { select: { name: true } } } }),
    ]);

    return {
      customer: basic,
      complaints: {
        openComplaintsCount,
        latestComplaint: latestComplaint?.publicNumber ?? null,
        latestComplaintStage: latestComplaint?.stage ?? null,
        latestComplaintPriority: latestComplaint?.priority ?? null,
        latestComplaintCategoryAr: latestComplaint?.category?.nameAr ?? null,
        latestComplaintCategoryEn: latestComplaint?.category?.nameEn ?? null,
        latestComplaintDepartment: latestComplaint?.department?.name ?? null,
        latestComplaintOpenedAt: latestComplaint?.openedAt ?? null,
        latestComplaintClosedAt: latestComplaint?.closedAt ?? null,
        history: complaintsHistory.map((c) => ({
          id: c.id,
          publicNumber: c.publicNumber,
          stage: c.stage,
          priority: c.priority,
          lifecycleStatus: c.lifecycleStatus,
          categoryAr: c.category?.nameAr ?? null,
          categoryEn: c.category?.nameEn ?? null,
          department: c.department?.name ?? null,
          openedAt: c.openedAt,
        })),
      },
      callCenter: {
        totalCalls,
        latestCallDate: latestCall?.startedAt ?? null,
        latestOutcome: latestCall?.outcome ?? null,
        pendingCallbackAt: pendingCallback?.scheduledAt ?? null,
        unreachable: unreachableCount > 0,
      },
      latestExperienceId,
      experiences: experiences.map((e) => ({
        id: e.id,
        purchaseDate: e.purchaseDate,
        deliveryDate: e.deliveryDate,
        externalSaleId: e.externalSaleId,
        financingType: e.financingType,
        insuranceType: e.insuranceType,
        salesChannel: e.salesChannel,
        vehicle: {
          id: e.vehicle.id,
          vin: e.vehicle.vin,
          modelYear: e.vehicle.modelYear,
          color: e.vehicle.color,
          model: e.vehicle.model,
        },
        branch: e.branch,
        salesperson: e.salesperson,
      })),
    };
  }

  return { list, get, create, update, setActive, customer360 };
}
