import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

// --- Period ---
const branchIdsCsv = z.string().optional().transform((v) => (v ? v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) : undefined));
export const PeriodQuerySchema = z.object({
  periodType: z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchIds: branchIdsCsv,
});

const PeriodInfo = z.object({ from: z.date(), to: z.date(), type: z.string().optional(), previousFrom: z.date().optional(), previousTo: z.date().optional() });
const ScopeInfo = z.object({ allBranches: z.boolean(), branchIds: z.array(z.number().int()) });

// --- Executive KPIs ---
export const ExecutiveKpisSchema = z.object({
  period: PeriodInfo,
  kpis: z.array(z.object({
    code: z.string(), name: z.string(), unit: z.string(),
    currentValue: z.number().nullable(), previousValue: z.number().nullable(),
    change: z.number().nullable(), changeDirection: z.enum(["UP", "DOWN", "FLAT"]),
    targetValue: z.number().nullable(), targetStatus: z.enum(["ACHIEVED", "NEAR_TARGET", "BELOW_TARGET", "UNAVAILABLE"]),
    unavailableReason: z.string().nullable(),
  })),
});

// ── The six approved reports (prompt §4) ─────────────────────────────────────
// Every rate is a FRACTION 0..1 and every `null` means "no data" — never 0.

const Reported = { period: PeriodInfo, scope: ScopeInfo };

export const ComplaintReportSchema = z.object({
  period: PeriodInfo,
  opened: z.number().int(), closed: z.number().int(), escalated: z.number().int(), reopened: z.number().int(), late: z.number().int(),
  averageClosureDurationHours: z.number().nullable(),
});

export const CallCenterReportSchema = z.object({
  period: PeriodInfo,
  calls: z.number().int(), completedCalls: z.number().int(), completionRate: z.number().nullable(), averageDurationSeconds: z.number().nullable(),
  outcomes: z.array(z.object({ outcome: z.string().nullable(), count: z.number().int() })), callbacks: z.number().int(), unreachable: z.number().int(), complaintRequests: z.number().int(),
});

/** Complaints summary rows for the selected period. */
export const ComplaintsSummarySchema = z.object({
  ...Reported,
  complaints: z.array(z.object({
    id: z.number().int(), publicNumber: z.string(), openedAt: z.date(), source: z.string(),
    customerName: z.string(), branchName: z.string().nullable(),
    categoryEn: z.string().nullable(), categoryAr: z.string().nullable(),
    priority: z.string(), lifecycleStatus: z.string(), stage: z.string(),
    departmentName: z.string().nullable(), assigneeName: z.string().nullable(),
    resolvedAt: z.date().nullable(), handlingHours: z.number().nullable(),
  })),
});

/** Call-center summary by agent. Duration is only reported when it is actually stored. */
export const CallCenterAgentsSchema = z.object({
  ...Reported,
  agents: z.array(z.object({
    agentUserId: z.number().int(), agentName: z.string(), assignedCases: z.number().int(),
    calls: z.number().int(), completedCases: z.number().int(), scheduledCallbacks: z.number().int(),
    noAnswer: z.number().int(), unreachable: z.number().int(),
    completionRate: z.number().nullable(), averageDurationSeconds: z.number().nullable(),
  })),
});

export const ReportLibrarySchema = z.array(z.object({
  code: z.string(), nameEn: z.string(), nameAr: z.string(),
  descriptionEn: z.string(), descriptionAr: z.string(),
  allowedFormats: z.array(z.string()), requiredPermission: z.string(),
}));

// ── Report preview (the SAME structure every export renders) ──────────────────
const ReportCellSchema = z.union([z.string(), z.number(), z.boolean(), z.date(), z.null()]);
const ReportCellTypeSchema = z.enum(["TEXT", "INTEGER", "DECIMAL", "PERCENT", "DATE", "DATETIME"]);

export const RunReportSchema = z.object({
  code: z.string(),
  titleEn: z.string(), titleAr: z.string(),
  descriptionEn: z.string(), descriptionAr: z.string(),
  generatedAt: z.date(),
  period: z.object({ from: z.date(), to: z.date(), type: z.string() }),
  scope: z.object({ allBranches: z.boolean(), branchIds: z.array(z.number().int()), branchNames: z.array(z.string()) }),
  filters: z.object({ periodType: z.string(), branchIds: z.array(z.number().int()).nullable() }),
  kpis: z.array(z.object({
    key: z.string(), labelEn: z.string(), labelAr: z.string(),
    type: ReportCellTypeSchema, value: z.number().nullable(),
  })),
  tables: z.array(z.object({
    key: z.string(), titleEn: z.string(), titleAr: z.string(),
    columns: z.array(z.object({
      key: z.string(), labelEn: z.string(), labelAr: z.string(),
      type: ReportCellTypeSchema, width: z.number().int().optional(),
    })),
    rows: z.array(z.array(ReportCellSchema)),
  })),
  totalRows: z.number().int(),
});

export const ReportCodeParam = z.object({ code: z.string().min(1).max(60) });
export const ExportQuerySchema = PeriodQuerySchema.extend({
  format: z.enum(["XLSX", "PDF"]).default("XLSX"),
  /** Export language for labels/titles. Defaults to the request language (Accept-Language) when omitted. */
  locale: z.enum(["en", "ar"]).optional(),
});
export const ArtifactSchema = z.object({ id: z.string(), reportCode: z.string(), format: z.string(), status: z.string(), sizeBytes: z.number().int().nullable(), expiresAt: z.date().nullable(), createdAt: z.date() });
export const ArtifactAccessSchema = z.object({ artifactId: z.string(), url: z.string(), expiresAt: z.date() });

// --- KPI targets ---
export const KpiTargetSchema = z.object({ id: z.number().int(), kpiCode: z.string(), scopeType: z.enum(["GLOBAL", "BRANCH"]), branchId: z.number().int().nullable(), periodType: z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]), targetValue: z.number(), effectiveFrom: z.date(), effectiveTo: z.date().nullable() });
export const CreateKpiTargetSchema = z.object({ kpiCode: z.string().min(1), scopeType: z.enum(["GLOBAL", "BRANCH"]).default("GLOBAL"), branchId: z.number().int().positive().optional(), periodType: z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]).default("MONTH"), targetValue: z.number(), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional() });

// --- Schedules ---
export const CreateScheduleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  reportCode: z.string().min(1),
  format: z.enum(["XLSX", "PDF"]).default("XLSX"),
  filters: z.record(z.string(), z.any()).optional(),
  timezone: z.string().optional(),
  recurrence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  recipientUserIds: z.array(z.number().int().positive()).max(100).optional(),
  recipientEmails: z.array(z.string().email()).max(100).optional(),
  enabled: z.boolean().optional(),
});
export const ScheduleSchema = z.object({ id: z.number().int(), name: z.string(), reportCode: z.string(), format: z.string(), recurrence: z.string(), hourOfDay: z.number().int(), dayOfWeek: z.number().int().nullable(), dayOfMonth: z.number().int().nullable(), timezone: z.string(), enabled: z.boolean(), lastRunAt: z.date().nullable(), nextRunAt: z.date().nullable(), createdAt: z.date() });
export const SetEnabledSchema = z.object({ enabled: z.boolean() });

// --- Integrations ---
export const IntegrationSchema = z.object({ id: z.number().int(), kind: z.string(), name: z.string(), status: z.string(), configured: z.boolean(), enabled: z.boolean(), lastHealthCheckAt: z.date().nullable(), lastSuccessAt: z.date().nullable(), lastErrorCode: z.string().nullable(), metadata: z.record(z.string(), z.any()).nullable() });
export const UpsertIntegrationSchema = z.object({ kind: z.enum(["ERP", "CRM", "WHATSAPP", "SMS", "EMAIL", "SSO_ACTIVE_DIRECTORY", "POWER_BI", "CUSTOM"]), name: z.string().trim().min(1).max(120), enabled: z.boolean().optional(), metadata: z.record(z.string(), z.any()).optional(), secret: z.string().min(1).max(4000).optional() });

// --- API keys ---
export const ApiKeySchema = z.object({ id: z.number().int(), name: z.string(), prefix: z.string(), scopes: z.array(z.string()), allBranches: z.boolean(), branchScope: z.array(z.number().int()).nullable(), createdByUserId: z.number().int().nullable(), expiresAt: z.date().nullable(), lastUsedAt: z.date().nullable(), revokedAt: z.date().nullable(), createdAt: z.date() });
export const ApiKeyCreatedSchema = ApiKeySchema.extend({ secret: z.string() });
export const CreateApiKeySchema = z.object({ name: z.string().trim().min(1).max(120), scopes: z.array(z.string().min(1)).min(1).max(20), allBranches: z.boolean().optional(), branchScope: z.array(z.number().int().positive()).max(200).optional(), expiresAt: z.coerce.date().optional() });
export const ListApiKeysQuerySchema = z.object({ sort: z.string().optional() });

// --- Audit log ---
export const AuditLogQuerySchema = PaginationQuerySchema.extend({
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  actorUserId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  sourceType: z.enum(["USER", "SYSTEM", "API"]).optional(),
  sort: z.string().optional(),
});
/** The audit filters WITHOUT pagination/sort — reused by the stats cards so they
 *  honour exactly the same filters the table honours. */
export const AuditStatsQuerySchema = AuditLogQuerySchema.omit({ page: true, pageSize: true, sort: true });
/** `actorName`/`actorEmail`/`entityLabel` are resolved projections (batched, never
 *  stored). Null means "not resolvable" — a label is never invented. */
export const AuditLogItemSchema = z.object({ id: z.string(), actorUserId: z.number().int().nullable(), actorName: z.string().nullable(), actorEmail: z.string().nullable(), action: z.string(), entityType: z.string().nullable(), entityId: z.string().nullable(), entityLabel: z.string().nullable(), sourceType: z.string(), hasChanges: z.boolean(), requestId: z.string().nullable(), createdAt: z.date(), metadata: z.record(z.string(), z.any()).nullable() });
/** Single-entry view: the list item plus the forensic detail kept out of lists/exports. */
export const AuditLogEntrySchema = AuditLogItemSchema.extend({ ip: z.string().nullable(), userAgent: z.string().nullable(), before: z.any().nullable(), after: z.any().nullable() });
export const AuditLogStatsSchema = z.object({ total: z.number().int(), today: z.number().int(), activeUsers: z.number().int(), creates: z.number().int(), updates: z.number().int(), deletes: z.number().int() });
export const AuditExportQuerySchema = AuditLogQuerySchema.extend({ format: z.enum(["CSV", "XLSX"]).default("CSV") });

// --- Security posture ---
export const SecurityPostureSchema = z.object({
  tls: z.string(), mfa: z.string(), sso: z.string(), piiMasking: z.string(), auditLogging: z.string(), backups: z.string(),
  passwordPolicy: z.string(), actionLinkExpiryDays: z.number().int().nullable(), singleSubmission: z.string(),
  dataResidency: z.object({ configuredRegion: z.string().nullable() }), complianceAttestation: z.string(), auditRetentionDays: z.number().int(),
});
