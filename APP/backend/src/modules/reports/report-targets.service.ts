import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import type { AuthUser } from "src/lib/context/auth-context";
import { targetNotFoundError, targetOverlapError } from "src/modules/reports/reports.errors";
import type { CreateKpiTargetSchema } from "src/modules/reports/reports.schema";

export function createReportTargetsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  function toPublic<T extends object>(t: T): T { return t; }

  async function list(query: { kpiCode?: string }) {
    const rows = await prisma.reportKpiTarget.findMany({ where: query.kpiCode ? { kpiCode: query.kpiCode } : {}, orderBy: { id: "desc" }, take: 500 });
    return rows.map(toPublic);
  }

  async function create(input: z.infer<typeof CreateKpiTargetSchema>, viewer: AuthUser) {
    // No overlapping ambiguous active target for the same kpi/scope/branch/period.
    const overlap = await prisma.reportKpiTarget.findFirst({
      where: {
        kpiCode: input.kpiCode, scopeType: input.scopeType, branchId: input.scopeType === "BRANCH" ? input.branchId ?? null : null, periodType: input.periodType,
        effectiveFrom: { lt: input.effectiveTo ?? new Date(8640000000000000) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
      },
    });
    if (overlap) throw targetOverlapError();
    const t = await prisma.reportKpiTarget.create({
      data: { kpiCode: input.kpiCode, scopeType: input.scopeType, branchId: input.scopeType === "BRANCH" ? input.branchId ?? null : null, periodType: input.periodType, targetValue: input.targetValue, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, createdByUserId: viewer.id },
    });
    return toPublic(t);
  }

  async function remove(id: number) {
    const t = await prisma.reportKpiTarget.findUnique({ where: { id } });
    if (!t) throw targetNotFoundError();
    await prisma.reportKpiTarget.delete({ where: { id } });
    return { deleted: true as const };
  }

  return { list, create, remove };
}
