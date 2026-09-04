import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

// --- Enums (mirror Prisma) ---
export const ComplaintPrioritySchema = z.enum(["CRITICAL", "URGENT", "HIGH", "MEDIUM", "LOW"]);
export const ComplaintSourceTypeSchema = z.enum(["CALL_CENTER", "MANUAL", "SYSTEM_ROUTING"]);
export const ComplaintLifecycleStatusSchema = z.enum(["OPEN", "RESOLVED", "CLOSED"]);
export const ComplaintStageSchema = z.enum(["NEW", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]);
export const WaitingReasonSchema = z.enum(["CUSTOMER", "DOCUMENTS", "OTHER_DEPARTMENT", "APPROVAL", "OTHER"]);
export const ComplaintRoutingStatusSchema = z.enum(["ROUTED", "UNROUTED"]);
export const ComplaintActionTypeSchema = z.enum(["PHONE_CALL", "WHATSAPP", "EMAIL", "SMS", "VISIT_MEETING", "INTERNAL_NOTE", "OTHER"]);
export const RoutingFactTypeSchema = z.enum(["SOURCE_TYPE", "COMPLAINT_REQUESTED"]);
export const RoutingOperatorSchema = z.enum(["EQUALS", "NOT_EQUALS", "IN", "IS_TRUE"]);

const Ref = z.object({ id: z.number().int(), name: z.string() }).nullable();
const CustomerSummary = z.object({ id: z.number().int(), name: z.string(), maskedPhone: z.string().nullable(), phone: z.string().nullable() });
// Minimal, PII-free reference to a user (id + display name only — never email,
// phone, roles, or permissions). Embedded in list/detail/timeline so the frontend
// resolves assignee/actor names from the projection, with zero per-row user fetches.
const SafeUserRef = z.object({ id: z.number().int(), displayName: z.string() });

// --- List ---
export const ListComplaintsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  priority: ComplaintPrioritySchema.optional(),
  stage: ComplaintStageSchema.optional(),
  lifecycleStatus: ComplaintLifecycleStatusSchema.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  assignedToUserId: z.coerce.number().int().positive().optional(),
  isLate: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  isEscalated: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  sourceType: ComplaintSourceTypeSchema.optional(),
  openedFrom: z.coerce.date().optional(),
  openedTo: z.coerce.date().optional(),
  sort: z.string().optional(),
});

const SlaSummary = z.object({
  firstResponseDueAt: z.date().nullable(),
  resolutionDueAt: z.date().nullable(),
  warnAt: z.date().nullable(),
  isLate: z.boolean(),
  remainingMinutes: z.number().int().nullable(),
});

export const ComplaintListItemSchema = z.object({
  id: z.number().int(),
  publicNumber: z.string(),
  customer: CustomerSummary,
  category: Ref,
  branch: Ref,
  department: Ref,
  assignedToUserId: z.number().int().nullable(),
  assignee: SafeUserRef.nullable(),
  priority: ComplaintPrioritySchema,
  lifecycleStatus: ComplaintLifecycleStatusSchema,
  stage: ComplaintStageSchema,
  routingStatus: ComplaintRoutingStatusSchema,
  sourceType: ComplaintSourceTypeSchema,
  isEscalated: z.boolean(),
  escalationLevel: z.number().int(),
  sla: SlaSummary,
  openedAt: z.date(),
  revision: z.number().int(),
});

export const ComplaintDetailSchema = ComplaintListItemSchema.extend({
  purchaseExperience: z.object({ id: z.number().int(), deliveryDate: z.date().nullable(), vehicleModel: z.string().nullable(), vehicleYear: z.number().int().nullable(), vin: z.string().nullable(), salespersonName: z.string().nullable() }).nullable(),
  sourceId: z.string().nullable(),
  description: z.string().nullable(),
  systemSummary: z.string().nullable(),
  summaryStatus: z.enum(["GENERATED", "UNAVAILABLE", "NOT_REQUESTED"]),
  customerComment: z.string().nullable(),
  firstRespondedAt: z.date().nullable(),
  resolvedAt: z.date().nullable(),
  resolutionSummary: z.string().nullable(),
  solutionProposed: z.string().nullable(),
  closedAt: z.date().nullable(),
  reopenedCount: z.number().int(),
  escalatedAt: z.date().nullable(),
  routingRuleId: z.number().int().nullable(),
  routingSnapshot: z.record(z.string(), z.any()).nullable(),
  timelinePreview: z.array(z.object({ id: z.number().int(), type: z.string(), actorUserId: z.number().int().nullable(), actor: SafeUserRef.nullable(), createdAt: z.date() })),
  // The pause reason — set only while stage = WAITING (null otherwise).
  waitingReason: WaitingReasonSchema.nullable(),
  waitingReasonNote: z.string().nullable(),
});

// --- Timeline ---
export const ListTimelineQuerySchema = PaginationQuerySchema;
export const TimelineEventSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  actorUserId: z.number().int().nullable(),
  actor: SafeUserRef.nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: z.date(),
});

// --- Similar ---
export const SimilarItemSchema = z.object({
  id: z.number().int(),
  publicNumber: z.string(),
  categoryId: z.number().int().nullable(),
  customerName: z.string().nullable(),
  branchName: z.string().nullable(),
  stage: ComplaintStageSchema,
  priority: ComplaintPrioritySchema,
  lifecycleStatus: ComplaintLifecycleStatusSchema,
  isLate: z.boolean(),
  openedAt: z.date(),
});

// --- Actions ---
export const ComplaintActionSchema = z.object({
  id: z.number().int(),
  type: ComplaintActionTypeSchema,
  content: z.string().nullable(),
  result: z.string().nullable(),
  customerVisible: z.boolean(),
  createdByUserId: z.number().int(),
  createdAt: z.date(),
});
export const CreateActionSchema = z.object({
  type: ComplaintActionTypeSchema,
  content: z.string().trim().min(1).max(4000),
  result: z.string().trim().max(500).optional(),
  customerVisible: z.boolean().optional(),
});

// --- Mutations ---
export const CreateComplaintSchema = z.object({
  customerId: z.number().int().positive(),
  purchaseExperienceId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  description: z.string().trim().min(1).max(4000),
  branchId: z.number().int().positive().optional(),
  // Department is the organisational routing target (department-first model):
  // chosen explicitly, or taken from the category default when omitted. The
  // employee is chosen FROM that department and must be eligible for it.
  departmentId: z.number().int().positive().optional(),
  priority: ComplaintPrioritySchema.optional(),
  assignedToUserId: z.number().int().positive().optional(),
  allowBranchOverride: z.boolean().optional(),
});
/** Eligible-employee lookup for a complaint's department (§22). */
export const AssigneeLookupQuerySchema = z.object({
  /** Optional: omitted → every department the viewer can see (routing-rule picker). */
  departmentId: z.coerce.number().int().positive().optional(),
  /** The complaint's branch — restricts the list to that branch's staff. */
  branchId: z.coerce.number().int().positive().optional(),
  /** Free-text filter on employee name (case-insensitive contains). */
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const AssigneeOptionSchema = z.object({
  userId: z.number().int(),
  name: z.string(),
  departmentName: z.string().nullable(),
  branchName: z.string().nullable(),
});

export const TransitionSchema = z.object({
  revision: z.number().int().min(0),
  toStage: ComplaintStageSchema,
  reason: z.string().trim().max(500).optional(),
  // Optional pause reason — only meaningful when toStage = WAITING; ignored (and
  // cleared) for any other target. `OTHER` may carry a short free-text note.
  waitingReason: WaitingReasonSchema.optional(),
  waitingReasonNote: z.string().trim().max(500).optional(),
});
// Persist a DRAFT proposed resolution without resolving (processing-form "save").
// Does not change lifecycle/stage; revision-CAS like every other mutation.
export const UpdateSolutionProposedSchema = z.object({ revision: z.number().int().min(0), solutionProposed: z.string().trim().max(4000) });
export const AssignSchema = z.object({ revision: z.number().int().min(0), assignedToUserId: z.number().int().positive(), reason: z.string().trim().max(500).optional() });
export const ChangeDepartmentSchema = z.object({ revision: z.number().int().min(0), departmentId: z.number().int().positive(), reason: z.string().trim().max(500).optional() });
export const ChangePrioritySchema = z.object({ revision: z.number().int().min(0), priority: ComplaintPrioritySchema, reason: z.string().trim().max(500).optional() });
export const ResolveSchema = z.object({ revision: z.number().int().min(0), resolutionSummary: z.string().trim().min(1).max(4000), solutionProposed: z.string().trim().max(4000).optional() });
export const CloseSchema = z.object({ revision: z.number().int().min(0), resolutionSummary: z.string().trim().min(1).max(4000).optional() });
export const ReopenSchema = z.object({ revision: z.number().int().min(0), reason: z.string().trim().min(1).max(500) });
/**
 * Escalating a case is an EXPLICIT TRANSFER, not a number.
 *
 * `targetDepartmentId` is required: the caller must say where the case goes.
 * `targetAssigneeId` is optional — omit it to hand the case to the department
 * and let it be assigned there.
 *
 * `level` is accepted but DEPRECATED and ignored: it never mapped to a
 * destination. It stays in the contract only so an existing integration does not
 * break; the ordinal is derived server-side.
 */
export const EscalateSchema = z.object({
  revision: z.number().int().min(0),
  reason: z.string().trim().min(1).max(500),
  targetDepartmentId: z.number().int().positive(),
  targetAssigneeId: z.number().int().positive().nullable().optional(),
  level: z.number().int().min(1).max(5).optional().describe("DEPRECATED — ignored; the escalation ordinal is derived server-side"),
});

/** One place a case can be escalated to, already resolved to a real name. */
export const EscalationTargetSchema = z.object({
  departmentId: z.number().int(),
  departmentName: z.string(),
  /** Employees eligible to receive the case in that department, if any. */
  assignees: z.array(z.object({ userId: z.number().int(), name: z.string() })),
  /** True when the department has exactly one eligible employee — the UI
   *  preselects them and shows the name BEFORE the operator confirms. */
  autoAssignee: z.object({ userId: z.number().int(), name: z.string() }).nullable(),
});
export const EscalationTargetsSchema = z.object({
  /** Where the case is right now, so the dialog can state the actual transfer. */
  currentDepartmentId: z.number().int().nullable(),
  currentDepartmentName: z.string().nullable(),
  currentAssigneeId: z.number().int().nullable(),
  currentAssigneeName: z.string().nullable(),
  targets: z.array(EscalationTargetSchema),
});

// --- Overview ---
export const OverviewSchema = z.object({
  openCount: z.number().int(),
  lateCount: z.number().int(),
  closedThisMonth: z.number().int(),
  averageClosureDurationHours: z.number().nullable(),
  openedFromCallCenter: z.number().int(),
  openedAutomatically: z.number().int(),
  escalatedCount: z.number().int(),
  // Open complaints per stage — drives the list stage-bar counts. Only stages with
  // open complaints appear; the client treats a missing stage as 0.
  byStage: z.array(z.object({ stage: ComplaintStageSchema, count: z.number().int() })),
});

// --- Export ---
export const ExportComplaintsQuerySchema = ListComplaintsQuerySchema.extend({ format: z.enum(["xlsx", "csv"]).optional() });

// --- Categories ---
export const ComplaintCategorySchema = z.object({
  id: z.number().int(), code: z.string(), nameEn: z.string(), nameAr: z.string(),
  defaultDepartmentId: z.number().int().nullable(), defaultPriority: ComplaintPrioritySchema.nullable(),
  active: z.boolean(), sortOrder: z.number().int(),
});

// --- Routing rules ---
export const RoutingRuleSchema = z.object({
  id: z.number().int(), name: z.string(),
  /** Stable business key for seeded template rules; null for user-created rules. */
  code: z.string().nullable(),
  active: z.boolean(), sortOrder: z.number().int(), revision: z.number().int(),
  sourceType: ComplaintSourceTypeSchema.nullable(),
  factType: RoutingFactTypeSchema, operator: RoutingOperatorSchema,
  valueString: z.string().nullable(), valueNumber: z.number().int().nullable(), valueBool: z.boolean().nullable(),
  categoryId: z.number().int(), departmentId: z.number().int().nullable(),
  /** Optional suggested assignee; the routed complaint's department is derived
   *  from them. Null = route to department only. */
  assignedToUserId: z.number().int().nullable(),
  /** Priority of the COMPLAINT this rule opens — NOT the rule's own precedence.
   *  Rule precedence is `sortOrder` (execution order) and nothing else. */
  priority: ComplaintPrioritySchema.describe("Priority of the complaint this rule opens (not the rule's own precedence; ordering is sortOrder)"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
const RuleConditionInput = {
  name: z.string().trim().min(1).max(200),
  /** EXECUTION ORDER — the only thing that decides evaluation precedence. */
  sortOrder: z.number().int().min(0).max(10000).optional().describe("Execution order; rules are evaluated ascending, ties broken by createdAt then id"),
  sourceType: ComplaintSourceTypeSchema.optional(),
  factType: RoutingFactTypeSchema,
  operator: RoutingOperatorSchema,
  valueString: z.string().trim().min(1).max(200).optional(),
  valueNumber: z.number().int().optional(),
  valueBool: z.boolean().optional(),
  categoryId: z.number().int().positive(),
  departmentId: z.number().int().positive().optional(),
  // The rule's suggested assignee. `code` is intentionally NOT accepted here —
  // it is set only by the template seed, and update preserves it.
  assignedToUserId: z.number().int().positive().nullable().optional(),
  /** Priority of the COMPLAINT this rule opens. A rule has no precedence of its
   *  own — never read this as "which rule wins". */
  priority: ComplaintPrioritySchema.describe("Priority of the complaint this rule opens (not the rule's own precedence)"),
};
export const CreateRoutingRuleSchema = z.object({
  ...RuleConditionInput,
  // Optional on create — the BACKEND owns the defaults so a simplified form can
  // send only what the operator actually chose:
  //   priority  → the category's defaultPriority, else MEDIUM
  //   sortOrder → appended after the last rule (never silently first)
  priority: ComplaintPrioritySchema.optional().describe("Priority of the complaint this rule opens; defaults to the category's default priority, else MEDIUM"),
});

/**
 * PARTIAL update: every field is optional and an OMITTED field keeps its stored
 * value. This is what lets a compact edit form change a name or a department
 * without silently resetting settings it never showed (execution order, source
 * scope, a specific assignee). An explicit `null` still CLEARS a nullable
 * field, so "leave alone" and "remove" stay distinguishable.
 */
export const UpdateRoutingRuleSchema = z.object({
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  sourceType: ComplaintSourceTypeSchema.nullable().optional(),
  factType: RoutingFactTypeSchema.optional(),
  operator: RoutingOperatorSchema.optional(),
  valueString: z.string().trim().min(1).max(200).nullable().optional(),
  valueNumber: z.number().int().nullable().optional(),
  valueBool: z.boolean().nullable().optional(),
  categoryId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  assignedToUserId: z.number().int().positive().nullable().optional(),
  priority: ComplaintPrioritySchema.optional(),
});
export const ActivateRuleSchema = z.object({ revision: z.number().int().min(0) });
export const RoutingPreviewSchema = z.object({
  // Either reference a source, or pass typed facts.
  callSessionId: z.number().int().positive().optional(),
  facts: z.object({
    sourceType: ComplaintSourceTypeSchema,
    complaintRequested: z.boolean().nullable().optional(),
  }).optional(),
});
export const DeleteRoutingRuleSchema = z.object({ revision: z.number().int().min(0) });

/** Real execution history for one rule: the complaints it actually opened. There
 *  is no separate execution-log table — a routed complaint IS the execution
 *  record (routingRuleId + routingSnapshot), so this reports the truth without
 *  inventing a parallel log. Branch-scoped to the caller. */
export const RoutingRuleExecutionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export const RoutingRuleExecutionsSchema = z.object({
  /** Total complaints this rule has opened WITHIN the caller's branch scope. */
  total: z.number().int(),
  lastExecutedAt: z.coerce.date().nullable(),
  recent: z.array(z.object({
    complaintId: z.number().int(),
    publicNumber: z.string(),
    openedAt: z.coerce.date(),
    departmentId: z.number().int().nullable(),
    assignedToUserId: z.number().int().nullable(),
    priority: ComplaintPrioritySchema,
    lifecycleStatus: ComplaintLifecycleStatusSchema,
  })),
});

export const RoutingPreviewResultSchema = z.object({
  matched: z.boolean(),
  ruleId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  departmentId: z.number().int().nullable(),
  priority: ComplaintPrioritySchema.nullable(),
  firstResponseMinutes: z.number().int().nullable(),
  resolutionMinutes: z.number().int().nullable(),
});

// --- SLA policies ---
export const SlaPolicySchema = z.object({
  priority: ComplaintPrioritySchema,
  firstResponseMinutes: z.number().int(),
  resolutionMinutes: z.number().int(),
  warningBeforeMinutes: z.number().int(),
  breachEscalationDelayMinutes: z.number().int().nullable(),
  active: z.boolean(),
  revision: z.number().int(),
});
export const UpdateSlaPolicySchema = z.object({
  revision: z.number().int().min(0),
  firstResponseMinutes: z.number().int().min(1).max(1000000),
  resolutionMinutes: z.number().int().min(1).max(10000000),
  warningBeforeMinutes: z.number().int().min(0).max(10000000),
  breachEscalationDelayMinutes: z.number().int().min(0).max(10000000).nullable().optional(),
  active: z.boolean().optional(),
});
export const PriorityParam = z.object({ priority: ComplaintPrioritySchema });

// --- Notification settings (event × channel preferences) ---
export const ComplaintNotifChannelSchema = z.enum(["IN_APP", "EMAIL", "WHATSAPP", "SMS"]);
export const ComplaintNotifAvailabilitySchema = z.enum(["CONFIGURED", "NOT_CONFIGURED", "UNAVAILABLE"]);
export const ComplaintNotificationSettingSchema = z.object({
  eventKey: z.string(),
  channel: ComplaintNotifChannelSchema,
  enabled: z.boolean(),
  // Provider readiness — computed, never implied by `enabled`. The UI must not
  // present an enabled-but-NOT_CONFIGURED channel as "connected".
  availability: ComplaintNotifAvailabilitySchema,
  revision: z.number().int(),
});
export const ComplaintNotificationSettingsSchema = z.object({
  channels: z.array(z.object({ channel: ComplaintNotifChannelSchema, availability: ComplaintNotifAvailabilitySchema })),
  events: z.array(z.object({ eventKey: z.string() })),
  settings: z.array(ComplaintNotificationSettingSchema),
});
export const UpdateComplaintNotificationSettingSchema = z.object({
  channel: ComplaintNotifChannelSchema,
  enabled: z.boolean(),
  revision: z.number().int().min(0),
});
export const ComplaintNotifEventKeyParam = z.object({ eventKey: z.string() });
