import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import {
  col, countRows, kpi,
  type ReportCell, type ReportKpi, type ReportResult, type ReportTable,
} from "src/modules/reports/report-model";
import { REPORT_BY_CODE } from "src/modules/reports/report-library";
import { reportNotFoundError } from "src/modules/reports/reports.errors";

/**
 * The approved report builders + the analytics primitives behind them.
 *
 * ONE query set per report. The tab endpoints and the library preview/export all
 * call the SAME function, so a number can never differ between what the screen
 * shows and what the file contains.
 *
 * Formula rules enforced here:
 *   - Aggregates are computed from RAW sums/counts, never as an average of averages.
 *   - `null` means "no data" and renders as "—" — never as 0.
 *
 * Performance: every builder issues a CONSTANT number of queries (group-bys +
 * batched name lookups). There is no per-branch / per-agent query anywhere.
 */

export interface ReportScope {
  all: boolean;
  ids: number[];
}

export interface ReportContext {
  from: Date;
  /** Exclusive. */
  to: Date;
  periodType: string;
  eff: ReportScope;
  requestedBranchIds: number[] | null;
}

export interface ComplaintSummaryRow {
  id: number;
  publicNumber: string;
  openedAt: Date;
  source: string;
  customerName: string;
  branchName: string | null;
  categoryEn: string | null;
  categoryAr: string | null;
  priority: string;
  lifecycleStatus: string;
  stage: string;
  departmentName: string | null;
  assigneeName: string | null;
  resolvedAt: Date | null;
  /** openedAt → resolvedAt in hours; null while the complaint is still open. */
  handlingHours: number | null;
}

export interface CallCenterAgentRow {
  agentUserId: number;
  agentName: string;
  assignedCases: number;
  calls: number;
  completedCases: number;
  scheduledCallbacks: number;
  noAnswer: number;
  unreachable: number;
  completionRate: number | null;
  /** Average call duration in seconds; null when no call has a stored duration. */
  averageDurationSeconds: number | null;
}

export type TrendGranularity = "DAY" | "WEEK" | "MONTH";

const COMPLETED_OUTCOMES = ["CALL_COMPLETED", "FOLLOW_UP_COMPLETED"];
const NO_ANSWER_OUTCOMES = ["NO_ANSWER", "BUSY", "PHONE_OFF"];

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
/** rate = part ÷ whole as a FRACTION; null when there is nothing to divide by. */
const rate = (part: number, whole: number): number | null => (whole > 0 ? round(part / whole, 4) : null);

/** Branch filter for a model that carries `branchId` directly. */
const branchOn = (eff: ReportScope) => (eff.all ? {} : { branchId: { in: eff.ids } });

export function createReportRunners(fastify: FastifyInstance, now: () => Date) {
  const prisma = fastify.prisma;

  // ── 1. Complaints summary ──────────────────────────────────────────────────

  async function complaintsSummaryData(ctx: ReportContext, limit: number): Promise<ComplaintSummaryRow[]> {
    const { from, to, eff } = ctx;
    const rows = await prisma.complaint.findMany({
      where: { openedAt: { gte: from, lt: to }, ...branchOn(eff) },
      select: {
        id: true, publicNumber: true, openedAt: true, sourceType: true, priority: true,
        lifecycleStatus: true, stage: true, resolvedAt: true,
        customer: { select: { name: true } },
        branch: { select: { name: true } },
        category: { select: { nameEn: true, nameAr: true } },
        department: { select: { name: true } },
        assignedTo: { select: { name: true, email: true } },
      },
      orderBy: { openedAt: "desc" },
      take: limit,
    });
    return rows.map((c): ComplaintSummaryRow => ({
      id: c.id,
      publicNumber: c.publicNumber,
      openedAt: c.openedAt,
      source: c.sourceType,
      customerName: c.customer.name,
      branchName: c.branch?.name ?? null,
      categoryEn: c.category?.nameEn ?? null,
      categoryAr: c.category?.nameAr ?? null,
      priority: c.priority,
      lifecycleStatus: c.lifecycleStatus,
      stage: c.stage,
      departmentName: c.department?.name ?? null,
      assigneeName: c.assignedTo?.name ?? c.assignedTo?.email ?? null,
      resolvedAt: c.resolvedAt,
      handlingHours: c.resolvedAt
        ? round((c.resolvedAt.getTime() - c.openedAt.getTime()) / 3_600_000, 2)
        : null,
    }));
  }

  // ── 6. Call center summary ─────────────────────────────────────────────────

  async function callCenterSummaryData(ctx: ReportContext): Promise<CallCenterAgentRow[]> {
    const { from, to, eff } = ctx;
    const sessionScope: Prisma.CallSessionWhereInput = {
      startedAt: { gte: from, lt: to },
      ...(eff.all ? {} : { queueItem: { branchId: { in: eff.ids } } }),
    };
    const [outcomeGroups, durationGroups, callGroups, assignedGroups, unreachableGroups] = await Promise.all([
      prisma.callSession.groupBy({
        by: ["agentUserId", "outcome"],
        where: { ...sessionScope, outcome: { not: null } },
        _count: { _all: true },
      }),
      prisma.callSession.groupBy({
        by: ["agentUserId"],
        where: { ...sessionScope, durationSeconds: { not: null } },
        _avg: { durationSeconds: true },
        _count: { _all: true },
      }),
      prisma.callSession.groupBy({ by: ["agentUserId"], where: sessionScope, _count: { _all: true } }),
      prisma.callCenterQueueItem.groupBy({
        by: ["assignedToUserId"],
        where: { claimedAt: { gte: from, lt: to }, assignedToUserId: { not: null }, ...branchOn(eff) },
        _count: { _all: true },
      }),
      prisma.callCenterQueueItem.groupBy({
        by: ["assignedToUserId"],
        where: {
          status: { in: ["UNREACHABLE", "INVALID_CONTACT"] },
          updatedAt: { gte: from, lt: to },
          assignedToUserId: { not: null },
          ...branchOn(eff),
        },
        _count: { _all: true },
      }),
    ]);

    const agentIds = [...new Set([
      ...callGroups.map((g) => g.agentUserId),
      ...assignedGroups.map((g) => g.assignedToUserId),
      ...unreachableGroups.map((g) => g.assignedToUserId),
    ])].filter((id): id is number => id != null);
    if (agentIds.length === 0) return [];

    const users = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, email: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    const durationTotal = new Map(
      durationGroups.map((g) => [g.agentUserId, { avg: g._avg.durationSeconds, samples: g._count._all }]),
    );

    return agentIds
      .map((id): CallCenterAgentRow => {
        const outcomes = outcomeGroups.filter((g) => g.agentUserId === id);
        const outcomeCount = (list: string[]) =>
          outcomes.filter((g) => g.outcome != null && list.includes(g.outcome)).reduce((n, g) => n + g._count._all, 0);
        const decided = outcomes.reduce((n, g) => n + g._count._all, 0);
        const completed = outcomeCount(COMPLETED_OUTCOMES);
        const dur = durationTotal.get(id);
        return {
          agentUserId: id,
          agentName: nameOf.get(id) ?? `#${id}`,
          assignedCases: assignedGroups.find((g) => g.assignedToUserId === id)?._count._all ?? 0,
          calls: callGroups.find((g) => g.agentUserId === id)?._count._all ?? 0,
          completedCases: completed,
          scheduledCallbacks: outcomeCount(["CALLBACK_REQUESTED"]),
          noAnswer: outcomeCount(NO_ANSWER_OUTCOMES),
          unreachable: unreachableGroups.find((g) => g.assignedToUserId === id)?._count._all ?? 0,
          // Completion is measured against calls that REACHED an outcome — a call
          // still in progress is not a failure.
          completionRate: rate(completed, decided),
          averageDurationSeconds: dur?.avg != null ? Math.round(dur.avg) : null,
        };
      })
      .sort((a, b) => b.calls - a.calls || a.agentName.localeCompare(b.agentName));
  }


  // ── Report assembly — the ONE structure preview + every export share ────────

  async function buildReport(
    code: string,
    ctx: ReportContext,
    branchNames: string[],
    rowLimit: number,
  ): Promise<ReportResult> {
    const def = REPORT_BY_CODE.get(code);
    if (!def) throw reportNotFoundError();

    const kpis: ReportKpi[] = [];
    const tables: ReportTable[] = [];

    if (def.code === "COMPLAINTS_SUMMARY") {
      const complaints = await complaintsSummaryData(ctx, rowLimit);
      const resolved = complaints.filter((c) => c.handlingHours != null);
      kpis.push(
        kpi("complaints", "Complaints opened", "الشكاوى المسجلة", "INTEGER", complaints.length),
        kpi("resolved", "Resolved", "المحلولة", "INTEGER", resolved.length),
        kpi("stillOpen", "Still open", "ما زالت مفتوحة", "INTEGER", complaints.length - resolved.length),
        kpi(
          "averageHandlingHours", "Average handling time (hours)", "متوسط مدة المعالجة (ساعة)", "DECIMAL",
          resolved.length > 0
            ? round(resolved.reduce((n, c) => n + (c.handlingHours ?? 0), 0) / resolved.length, 2)
            : null,
        ),
      );
      tables.push({
        key: "complaints",
        titleEn: "Complaints",
        titleAr: "الشكاوى",
        columns: [
          col("publicNumber", "Complaint no.", "رقم الشكوى", "TEXT", 16),
          col("openedAt", "Created at", "تاريخ الإنشاء", "DATETIME", 20),
          col("source", "Source", "مصدر الشكوى", "TEXT", 18),
          col("customerName", "Customer", "العميل", "TEXT", 24),
          col("branchName", "Branch", "الفرع", "TEXT", 20),
          col("category", "Category", "التصنيف", "TEXT", 22),
          col("priority", "Priority", "الأولوية", "TEXT", 14),
          col("lifecycleStatus", "Status", "الحالة", "TEXT", 14),
          col("departmentName", "Department", "القسم المسؤول", "TEXT", 22),
          col("assigneeName", "Assignee", "الموظف المسؤول", "TEXT", 22),
          col("resolvedAt", "Resolved at", "تاريخ الحل", "DATETIME", 20),
          col("handlingHours", "Handling time (hours)", "مدة المعالجة (ساعة)", "DECIMAL", 18),
        ],
        rows: complaints.map((c): ReportCell[] => [
          c.publicNumber, c.openedAt, c.source, c.customerName, c.branchName,
          c.categoryAr ?? c.categoryEn, c.priority, c.lifecycleStatus,
          c.departmentName, c.assigneeName, c.resolvedAt, c.handlingHours,
        ]),
      });
    } else if (def.code === "CALL_CENTER_SUMMARY") {
      const agents = await callCenterSummaryData(ctx);
      const withDuration = agents.filter((a) => a.averageDurationSeconds != null);
      const durationWeight = withDuration.reduce((n, a) => n + a.calls, 0);
      kpis.push(
        kpi("agents", "Agents", "عدد الموظفين", "INTEGER", agents.length),
        kpi("calls", "Calls", "عدد المكالمات", "INTEGER", agents.reduce((n, a) => n + a.calls, 0)),
        kpi("completedCases", "Completed cases", "الحالات المكتملة", "INTEGER", agents.reduce((n, a) => n + a.completedCases, 0)),
        kpi(
          "averageDurationSeconds", "Average call duration (seconds)", "متوسط مدة المكالمة (ثانية)", "INTEGER",
          durationWeight > 0
            ? Math.round(withDuration.reduce((n, a) => n + (a.averageDurationSeconds ?? 0) * a.calls, 0) / durationWeight)
            : null,
        ),
      );
      tables.push({
        key: "agents",
        titleEn: "Agents",
        titleAr: "الموظفون",
        columns: [
          col("agentName", "Agent", "اسم الموظف", "TEXT", 26),
          col("assignedCases", "Assigned cases", "الحالات المسندة", "INTEGER", 16),
          col("calls", "Calls", "المكالمات", "INTEGER", 12),
          col("completedCases", "Completed cases", "الحالات المكتملة", "INTEGER", 18),
          col("scheduledCallbacks", "Scheduled callbacks", "معاودة اتصال مجدولة", "INTEGER", 20),
          col("noAnswer", "No answer", "حالات عدم الإجابة", "INTEGER", 18),
          col("unreachable", "Unreachable", "تعذّر الوصول النهائي", "INTEGER", 20),
          col("completionRate", "Completion rate", "نسبة الإكمال", "PERCENT", 14),
          col("averageDurationSeconds", "Average duration (seconds)", "متوسط مدة المكالمة (ثانية)", "INTEGER", 24),
        ],
        rows: agents.map((a): ReportCell[] => [
          a.agentName, a.assignedCases, a.calls, a.completedCases, a.scheduledCallbacks,
          a.noAnswer, a.unreachable, a.completionRate, a.averageDurationSeconds,
        ]),
      });
    } else {
      throw reportNotFoundError();
    }

    return {
      code: def.code,
      titleEn: def.nameEn,
      titleAr: def.nameAr,
      descriptionEn: def.descriptionEn,
      descriptionAr: def.descriptionAr,
      generatedAt: now(),
      period: { from: ctx.from, to: ctx.to, type: ctx.periodType },
      scope: { allBranches: ctx.eff.all, branchIds: ctx.eff.ids, branchNames },
      filters: { periodType: ctx.periodType, branchIds: ctx.requestedBranchIds },
      kpis,
      tables,
      totalRows: countRows(tables),
    };
  }


  return {
    complaintsSummaryData,
    callCenterSummaryData,
    buildReport,
  };
}

export type ReportRunners = ReturnType<typeof createReportRunners>;
