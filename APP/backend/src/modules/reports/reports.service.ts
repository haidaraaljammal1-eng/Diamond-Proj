import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { resolvePeriod, type Period, type PeriodType } from "src/modules/reports/periods";
import { loadReportConfig, REPORT_EXPORT_ROW_LIMIT } from "src/modules/reports/reports.config";
import { KPI_CATALOG } from "src/modules/reports/kpi-catalog";
import { REPORT_LIBRARY } from "src/modules/reports/report-library";
import {
  avgHours, change, targetStatus, type TargetStatus,
} from "src/modules/reports/report-metrics";
import { invalidPeriodError } from "src/modules/reports/reports.errors";
import { createReportRunners, type ReportContext } from "src/modules/reports/report-runners";

type Deps = { now?: () => Date };
type Scope = { all: boolean; branchIds: number[] };

export interface PeriodQuery {
  periodType?: PeriodType;
  from?: Date;
  to?: Date;
  branchIds?: number[];
}

export function createReportsService(fastify: FastifyInstance, deps: Deps = {}) {
  const prisma = fastify.prisma;
  const now = deps.now ?? (() => new Date());
  const runners = createReportRunners(fastify, now);

  // --- Scope ---
  async function resolveScope(viewer: AuthUser): Promise<Scope> {
    if (hasPermission(viewer, PERMISSIONS.REPORTS_VIEW_ALL_BRANCHES)) return { all: true, branchIds: [] };
    const rows = await prisma.userBranchAssignment.findMany({ where: { userId: viewer.id }, select: { branchId: true } });
    return { all: false, branchIds: rows.map((r) => r.branchId) };
  }
  /** Effective branch ids = scope ∩ requested (a request can never widen scope). */
  function effectiveBranchIds(scope: Scope, requested?: number[]): { all: boolean; ids: number[] } {
    if (scope.all) return requested && requested.length ? { all: false, ids: requested } : { all: true, ids: [] };
    const ids = requested && requested.length ? scope.branchIds.filter((b) => requested.includes(b)) : scope.branchIds;
    return { all: false, ids };
  }
  const branchFilter = (eff: { all: boolean; ids: number[] }): Prisma.IntNullableFilter | undefined => (eff.all ? undefined : { in: eff.ids });

  async function resolvePeriodQuery(query: PeriodQuery): Promise<{ period: ReturnType<typeof resolvePeriod> }> {
    const config = await loadReportConfig(fastify);
    const type = query.periodType ?? "MONTH";
    if (type === "CUSTOM") {
      if (!query.from || !query.to || query.to.getTime() <= query.from.getTime()) throw invalidPeriodError("custom period requires from < to");
    }
    return { period: resolvePeriod(type, now(), config.timezoneOffsetMinutes, query.from, query.to) };
  }

  /**
   * ONE resolved reporting context (period + effective branch scope + branch names),
   * shared by every report, every tab endpoint and every export — so a filter always
   * means the same thing everywhere (prompt §2).
   */
  async function buildContext(query: PeriodQuery, viewer: AuthUser, usePrevious = false) {
    const scope = await resolveScope(viewer);
    const eff = effectiveBranchIds(scope, query.branchIds);
    const { period } = await resolvePeriodQuery(query);
    const window = usePrevious ? period.previous : period.current;
    const branchNames = eff.all
      ? []
      : (await prisma.branch.findMany({ where: { id: { in: eff.ids } }, select: { name: true }, orderBy: { name: "asc" } })).map((b) => b.name);
    const ctx: ReportContext = {
      from: window.from,
      to: window.to,
      periodType: period.type,
      eff,
      requestedBranchIds: query.branchIds && query.branchIds.length ? query.branchIds : null,
    };
    return { ctx, branchNames, period };
  }

  // --- Metric primitives (period + branch scoped) ---
  async function closureFor(p: Period, bf: Prisma.IntNullableFilter | undefined) {
    const rows = await prisma.complaint.findMany({ where: { lifecycleStatus: "CLOSED", closedAt: { gte: p.from, lt: p.to }, ...(bf ? { branchId: bf } : {}) }, select: { openedAt: true, closedAt: true }, take: 5000 });
    return { value: avgHours(rows.filter((r) => r.closedAt).map((r) => r.closedAt!.getTime() - r.openedAt.getTime())), closed: rows.length };
  }
  async function lateFor(p: Period, eff: { all: boolean; ids: number[] }) {
    const count = await prisma.complaintSlaCycle.count({ where: { resolutionBreachedAt: { gte: p.from, lt: p.to }, ...(eff.all ? {} : { complaint: { branchId: { in: eff.ids } } }) } });
    return { value: count };
  }

  // --- KPI value dispatcher (executive KPI catalog: dashboard + external API) ---
  async function kpiValue(code: string, p: Period, eff: { all: boolean; ids: number[] }): Promise<number | null> {
    const bf = branchFilter(eff);
    switch (code) {
      case "AVG_COMPLAINT_CLOSURE_TIME": return (await closureFor(p, bf)).value;
      case "LATE_COMPLAINTS": return (await lateFor(p, eff)).value;
      default: return null; // FCR + retention are alwaysUnavailable
    }
  }

  async function activeTarget(kpiCode: string, eff: { all: boolean; ids: number[] }, at: Date): Promise<number | null> {
    const t = await prisma.reportKpiTarget.findFirst({
      where: { kpiCode, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }], ...(eff.all || eff.ids.length !== 1 ? { scopeType: "GLOBAL" } : { OR: [{ scopeType: "BRANCH", branchId: eff.ids[0] }, { scopeType: "GLOBAL" }] }) },
      orderBy: [{ scopeType: "asc" }, { effectiveFrom: "desc" }],
    });
    return t?.targetValue ?? null;
  }

  // --- Executive KPIs (home dashboard + external API contract) ---
  async function executiveKpis(query: PeriodQuery, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const eff = effectiveBranchIds(scope, query.branchIds);
    const { period } = await resolvePeriodQuery(query);
    const items = await Promise.all(KPI_CATALOG.map(async (kpi) => {
      if (kpi.alwaysUnavailable) return { code: kpi.code, name: kpi.nameEn, unit: kpi.unit, currentValue: null, previousValue: null, change: null, changeDirection: "FLAT" as const, targetValue: null, targetStatus: "UNAVAILABLE" as TargetStatus, unavailableReason: kpi.unavailableReason ?? null };
      const [cur, prev, target] = await Promise.all([kpiValue(kpi.code, period.current, eff), kpiValue(kpi.code, period.previous, eff), activeTarget(kpi.code, eff, period.current.from)]);
      const ch = change(cur, prev);
      return { code: kpi.code, name: kpi.nameEn, unit: kpi.unit, currentValue: cur, previousValue: prev, change: ch.change, changeDirection: ch.changeDirection, targetValue: target, targetStatus: targetStatus(cur, target, kpi.betterDirection), unavailableReason: cur == null ? "no_data" : null };
    }));
    return { period: { from: period.current.from, to: period.current.to, previousFrom: period.previous.from, previousTo: period.previous.to, type: period.type }, kpis: items };
  }

  // --- Complaint overview (home dashboard + complaints tab KPIs) ---
  async function complaintOverview(query: PeriodQuery, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const eff = effectiveBranchIds(scope, query.branchIds);
    const { period } = await resolvePeriodQuery(query);
    const p = period.current;
    const bf = branchFilter(eff);
    const [opened, closed, escalated, reopened, late, closure] = await Promise.all([
      prisma.complaint.count({ where: { openedAt: { gte: p.from, lt: p.to }, ...(bf ? { branchId: bf } : {}) } }),
      prisma.complaint.count({ where: { lifecycleStatus: "CLOSED", closedAt: { gte: p.from, lt: p.to }, ...(bf ? { branchId: bf } : {}) } }),
      prisma.complaint.count({ where: { escalatedAt: { gte: p.from, lt: p.to }, ...(bf ? { branchId: bf } : {}) } }),
      prisma.complaint.count({ where: { lastReopenedAt: { gte: p.from, lt: p.to }, ...(bf ? { branchId: bf } : {}) } }),
      lateFor(p, eff),
      closureFor(p, bf),
    ]);
    return { period: { from: p.from, to: p.to, type: period.type }, opened, closed, escalated, reopened, late: late.value, averageClosureDurationHours: closure.value };
  }

  // --- Call center period overview (home dashboard) ---
  async function callCenterPerformance(query: PeriodQuery, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const eff = effectiveBranchIds(scope, query.branchIds);
    const { period } = await resolvePeriodQuery(query);
    const p = period.current;
    const sBranch: Prisma.CallSessionWhereInput = eff.all ? {} : { queueItem: { branchId: { in: eff.ids } } };
    const inPeriod = { startedAt: { gte: p.from, lt: p.to } };
    const [calls, durAgg, outcomeGroups, completedCalls, callbacks, unreachable, complaintRequests] = await Promise.all([
      prisma.callSession.count({ where: { ...inPeriod, ...sBranch } }),
      prisma.callSession.aggregate({ _avg: { durationSeconds: true }, where: { ...inPeriod, durationSeconds: { not: null }, ...sBranch } }),
      prisma.callSession.groupBy({ by: ["outcome"], where: { ...inPeriod, outcome: { not: null }, ...sBranch }, _count: { _all: true } }),
      prisma.callSession.count({ where: { ...inPeriod, outcome: { in: ["CALL_COMPLETED", "FOLLOW_UP_COMPLETED"] }, ...sBranch } }),
      prisma.callCallback.count({ where: { createdAt: { gte: p.from, lt: p.to }, ...(eff.all ? {} : { queueItem: { branchId: { in: eff.ids } } }) } }),
      prisma.callCenterQueueItem.count({ where: { status: "UNREACHABLE", updatedAt: { gte: p.from, lt: p.to }, ...(eff.all ? {} : { branchId: { in: eff.ids } }) } }),
      prisma.callSession.count({ where: { ...inPeriod, complaintRequested: true, ...sBranch } }),
    ]);
    const answered = await prisma.callSession.count({ where: { ...inPeriod, outcome: { in: ["CALL_COMPLETED", "FOLLOW_UP_COMPLETED", "REFUSED_PARTICIPATION", "CALLBACK_REQUESTED"] }, ...sBranch } });
    return {
      period: { from: p.from, to: p.to, type: period.type }, calls, completedCalls,
      completionRate: answered > 0 ? Math.round((completedCalls / answered) * 10000) / 10000 : null,
      averageDurationSeconds: durAgg._avg.durationSeconds ?? null,
      outcomes: outcomeGroups.map((g) => ({ outcome: g.outcome, count: g._count._all })), callbacks, unreachable, complaintRequests,
    };
  }

  // ── The approved reports ────────────────────────────────────────────────────
  // Each tab endpoint below calls exactly the SAME builder the library preview and
  // every export call, so a screen and a downloaded file can never disagree (§16).

  const withPeriod = <T>(ctx: ReportContext, data: T) => ({
    period: { from: ctx.from, to: ctx.to, type: ctx.periodType },
    scope: { allBranches: ctx.eff.all, branchIds: ctx.eff.ids },
    ...data,
  });

  async function complaintsSummary(query: PeriodQuery, viewer: AuthUser) {
    const { ctx } = await buildContext(query, viewer);
    return withPeriod(ctx, { complaints: await runners.complaintsSummaryData(ctx, REPORT_EXPORT_ROW_LIMIT) });
  }

  async function callCenterAgents(query: PeriodQuery, viewer: AuthUser) {
    const { ctx } = await buildContext(query, viewer);
    return withPeriod(ctx, { agents: await runners.callCenterSummaryData(ctx) });
  }

  /** The catalog, filtered to the reports this viewer may actually open (§23). */
  function reportLibrary(viewer: AuthUser) {
    return REPORT_LIBRARY.filter((r) => hasPermission(viewer, r.requiredPermission)).map((r) => ({
      code: r.code,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      descriptionEn: r.descriptionEn,
      descriptionAr: r.descriptionAr,
      allowedFormats: r.allowedFormats,
      requiredPermission: r.requiredPermission,
    }));
  }

  /** Build a report (JSON preview). The exports call this exact function. */
  async function runReport(code: string, query: PeriodQuery, viewer: AuthUser) {
    const { ctx, branchNames } = await buildContext(query, viewer);
    return runners.buildReport(code, ctx, branchNames, REPORT_EXPORT_ROW_LIMIT);
  }

  return {
    resolveScope, effectiveBranchIds, resolvePeriodQuery, buildContext,
    executiveKpis, complaintOverview, callCenterPerformance,
    complaintsSummary, callCenterAgents,
    reportLibrary, runReport,
  };
}

