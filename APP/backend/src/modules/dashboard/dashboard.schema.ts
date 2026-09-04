import { z } from "zod";
import { CallCenterReportSchema, ComplaintReportSchema, ExecutiveKpisSchema } from "src/modules/reports/reports.schema";

/**
 * Home dashboard aggregate. Every cross-domain section is NULLABLE: it is null when
 * the viewer lacks the section's domain read permission, or when that section failed
 * to compute (error isolation — one broken widget never fails the whole dashboard).
 * `null` therefore means "not available to you / errored", never "zero".
 */

const ComplaintsNowSchema = z.object({
  openCount: z.number().int(), lateCount: z.number().int(), closedThisMonth: z.number().int(),
  averageClosureDurationHours: z.number().nullable(),
  openedFromCallCenter: z.number().int(), openedAutomatically: z.number().int(), escalatedCount: z.number().int(),
});

const OverdueComplaintSchema = z.object({
  id: z.number().int(), publicNumber: z.string(),
  category: z.string().nullable(), priority: z.string(), lifecycleStatus: z.string(),
  isLate: z.boolean(), isEscalated: z.boolean(),
  resolutionDueAt: z.date().nullable(), remainingMinutes: z.number().int().nullable(),
});

const CallCenterTodaySchema = z.object({
  callsToday: z.number().int(), customersFollowedUpToday: z.number().int(),
  pendingQueue: z.number().int(), dueCallbacks: z.number().int(), unreachableCount: z.number().int(), complaintRequests: z.number().int(),
  averageCallDurationSeconds: z.number().nullable(),
});

export const DashboardOverviewSchema = z.object({
  period: z.object({ from: z.date(), to: z.date(), previousFrom: z.date().nullable(), previousTo: z.date().nullable(), type: z.string() }),
  // The business-timezone calendar day every "today" counter was computed over.
  today: z.object({ from: z.date(), to: z.date(), offsetMinutes: z.number().int() }),
  scope: z.object({ allBranches: z.boolean(), branchIds: z.array(z.number().int()) }),
  generatedAt: z.date(),

  kpis: ExecutiveKpisSchema.nullable(),
  callCenterToday: CallCenterTodaySchema.nullable(),
  callCenterPeriod: CallCenterReportSchema.nullable(),
  complaintsNow: ComplaintsNowSchema.nullable(),
  complaintsPeriod: ComplaintReportSchema.nullable(),
  overdueComplaints: z.array(OverdueComplaintSchema).nullable(),
  entityCounts: z.object({ purchaseExperiences: z.number().int().nullable() }),
  urgentItems: z.array(z.object({ kind: z.string(), count: z.number().int() })),
});
