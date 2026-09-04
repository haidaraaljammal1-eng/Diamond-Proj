import type { FastifyInstance } from "fastify";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createReportsService, type PeriodQuery } from "src/modules/reports/reports.service";
import { createComplaintsService } from "src/modules/complaints/complaints.service";
import { createCallCenterService } from "src/modules/call-center/call-center.service";
import { loadReportConfig } from "src/modules/reports/reports.config";
import { resolveBusinessDay } from "src/modules/reports/periods";

const P = PERMISSIONS;

/**
 * Home dashboard aggregator. Composes EXISTING domain services (reports /
 * complaints / call-center) so every KPI is single-sourced with the
 * reports/analytics pages — the dashboard never re-derives a metric. Each section
 * is permission-gated and error-isolated: a section the viewer can't see, or one
 * that throws, becomes `null` (rendered as "—"/hidden by the client), never a
 * fabricated number.
 *
 * Branch scope: period sections use the reports scope (userBranchAssignment +
 * reports.view_all_branches); the live "now" sections (complaints/call-center overview)
 * each resolve their own domain scope. A request can only NARROW scope, never widen it.
 */
export function createDashboardService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const reports = createReportsService(fastify);
  const complaints = createComplaintsService(fastify);
  const callCenter = createCallCenterService(fastify);

  async function countPurchaseExperiences(eff: { all: boolean; ids: number[] }, from: Date, to: Date) {
    return prisma.purchaseExperience.count({ where: { createdAt: { gte: from, lt: to }, ...(eff.all ? {} : { branchId: { in: eff.ids } }) } });
  }

  async function overview(query: PeriodQuery, viewer: AuthUser) {
    /** Run a section only if the viewer holds its gate permission; swallow errors to null
     *  (error isolation). Defined per-request so viewer is never shared across requests. */
    const runSection = async <T>(label: string, perm: string, fn: () => Promise<T>): Promise<T | null> => {
      if (!hasPermission(viewer, perm)) return null;
      try {
        return await fn();
      } catch (err) {
        fastify.log.error({ err, section: label }, "dashboard section failed");
        return null;
      }
    };

    // Resolve the reports scope + period ONCE (drives the entity counts).
    const scope = await reports.resolveScope(viewer);
    const eff = reports.effectiveBranchIds(scope, query.branchIds);
    const { period } = await reports.resolvePeriodQuery(query);
    const cur = period.current;

    // "Today" = the BUSINESS-timezone calendar day, resolved once and shared by every
    // today-counter so the whole card reads the same day. Persistence stays UTC.
    const reportConfig = await loadReportConfig(fastify);
    const today = resolveBusinessDay(new Date(), reportConfig.timezoneOffsetMinutes);

    const [
      kpis,
      complaintsPeriod, complaintsNow, overdue,
      callCenterToday, callCenterPeriod,
      purchaseExperiences,
    ] = await Promise.all([
      runSection("kpis", P.REPORTS_EXECUTIVE_READ, () => reports.executiveKpis(query, viewer)),
      runSection("complaintsPeriod", P.REPORTS_COMPLAINTS_READ, () => reports.complaintOverview(query, viewer)),
      runSection("complaintsNow", P.COMPLAINTS_READ, () => complaints.overview(viewer)),
      runSection("overdue", P.COMPLAINTS_READ, () => complaints.list({ page: 1, pageSize: 5, isLate: true, isEscalated: undefined, lifecycleStatus: "OPEN", sort: "slaResolutionDueAt:asc" }, viewer)),
      runSection("callCenterToday", P.CALL_CENTER_QUEUE_READ, () => callCenter.overview(viewer)),
      runSection("callCenterPeriod", P.REPORTS_CALL_CENTER_READ, () => reports.callCenterPerformance(query, viewer)),
      runSection("purchaseExperiences", P.PURCHASE_EXPERIENCES_READ, () => countPurchaseExperiences(eff, cur.from, cur.to)),
    ]);

    const overdueComplaints = overdue
      ? overdue.data.map((c) => ({
          id: c.id, publicNumber: c.publicNumber, category: c.category?.name ?? null,
          priority: c.priority, lifecycleStatus: c.lifecycleStatus, isLate: c.sla.isLate, isEscalated: c.isEscalated,
          resolutionDueAt: c.sla.resolutionDueAt, remainingMinutes: c.sla.remainingMinutes,
        }))
      : null;

    // "Needs attention today" — derived from already-fetched sections (NOT a new domain).
    const urgentItems: { kind: string; count: number }[] = [];
    if (complaintsNow) {
      if (complaintsNow.lateCount > 0) urgentItems.push({ kind: "OVERDUE_COMPLAINTS", count: complaintsNow.lateCount });
      if (complaintsNow.escalatedCount > 0) urgentItems.push({ kind: "ESCALATED_COMPLAINTS", count: complaintsNow.escalatedCount });
    }
    if (callCenterToday && callCenterToday.dueCallbacks > 0) {
      urgentItems.push({ kind: "DUE_CALLBACKS", count: callCenterToday.dueCallbacks });
    }

    return {
      period: { from: cur.from, to: cur.to, previousFrom: period.previous.from, previousTo: period.previous.to, type: period.type },
      today: { from: today.from, to: today.to, offsetMinutes: reportConfig.timezoneOffsetMinutes },
      scope: { allBranches: eff.all, branchIds: eff.ids },
      generatedAt: new Date(),
      kpis,
      callCenterToday,
      callCenterPeriod,
      complaintsNow,
      complaintsPeriod,
      overdueComplaints,
      entityCounts: { purchaseExperiences: purchaseExperiences ?? null },
      urgentItems,
    };
  }

  return { overview };
}
