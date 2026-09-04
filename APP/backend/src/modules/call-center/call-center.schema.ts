import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

// --- Enums (mirror the Prisma enums) ---

export const CallQueueSourceTypeSchema = z.enum(["COMPLAINT", "CALLBACK", "MANUAL"]);
export const CallQueuePrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const CallQueueStatusSchema = z.enum([
  "NEW", "CLAIMED", "IN_PROGRESS", "CALLBACK_SCHEDULED", "COMPLETED",
  "UNREACHABLE", "REFUSED", "INVALID_CONTACT", "CANCELLED",
]);
export const CallSessionStatusSchema = z.enum(["IN_PROGRESS", "COMPLETED", "FAILED", "ABANDONED"]);
export const CallOutcomeSchema = z.enum([
  "CALL_COMPLETED", "NO_ANSWER", "WRONG_NUMBER", "PHONE_OFF", "BUSY",
  "CALLBACK_REQUESTED", "REFUSED_PARTICIPATION", "FOLLOW_UP_COMPLETED",
]);
export const CallCallbackStatusSchema = z.enum(["SCHEDULED", "DUE", "CLAIMED", "COMPLETED", "CANCELLED"]);
export const CallCallbackReasonSchema = z.enum(["CUSTOMER_REQUESTED", "NO_ANSWER_RETRY", "PHONE_OFF_RETRY", "BUSY_RETRY"]);
export const CallRecordingStatusSchema = z.enum(["PENDING", "AVAILABLE", "FAILED", "UNAVAILABLE"]);

// --- Shared shapes ---

const CustomerSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  maskedPhone: z.string().nullable(),
  // Full phone only for callers holding call_center_contacts.read; else null.
  phone: z.string().nullable(),
  type: z.enum(["INDIVIDUAL", "COMPANY"]),
});

const VehicleSummary = z.object({
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  vin: z.string().nullable(),
}).nullable();

const BranchRef = z.object({ id: z.number().int(), name: z.string() }).nullable();
const SalespersonRef = z.object({ id: z.number().int(), name: z.string() }).nullable();
// Minimal, safe agent summary for the call log / detail — id + a display name
// only. Never email / phone / roles / permissions. `displayName` is computed
// (`User.name` is nullable) so the frontend never shows a raw id. Nullable to
// follow the house convention, though the FK is required in practice.
const AgentRef = z
  .object({ id: z.number().int(), displayName: z.string() })
  .nullable();

// --- Queue list ---

export const ListQueueQuerySchema = PaginationQuerySchema.extend({
  reasonType: CallQueueSourceTypeSchema.optional(),
  status: CallQueueStatusSchema.optional(),
  priority: CallQueuePrioritySchema.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  assignedToUserId: z.coerce.number().int().positive().optional(),
  dueCallbacks: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  search: z.string().trim().min(1).optional(),
  sort: z.string().optional(),
});

export const QueueListItemSchema = z.object({
  id: z.number().int(),
  priority: CallQueuePrioritySchema,
  priorityRank: z.number().int(),
  sourceType: CallQueueSourceTypeSchema,
  reasonCode: z.string().nullable(),
  reasonSummary: z.string().nullable(),
  status: CallQueueStatusSchema,
  customer: CustomerSummary,
  vehicle: VehicleSummary,
  branch: BranchRef,
  attemptCount: z.number().int(),
  unansweredAttemptCount: z.number().int(),
  assignedToUserId: z.number().int().nullable(),
  dueAt: z.date().nullable(),
  createdAt: z.date(),
});

// --- Call context (full, no N+1) ---

export const CallContextSchema = z.object({
  queueItem: z.object({
    id: z.number().int(),
    sourceType: CallQueueSourceTypeSchema,
    reasonCode: z.string().nullable(),
    reasonSummary: z.string().nullable(),
    priority: CallQueuePrioritySchema,
    status: CallQueueStatusSchema,
    attemptCount: z.number().int(),
    unansweredAttemptCount: z.number().int(),
    assignedToUserId: z.number().int().nullable(),
    dueAt: z.date().nullable(),
  }),
  customer: CustomerSummary,
  vehicle: VehicleSummary,
  branch: BranchRef,
  salesperson: SalespersonRef,
  purchaseExperience: z.object({ id: z.number().int(), deliveryDate: z.date().nullable(), purchaseDate: z.date().nullable() }).nullable(),
  activeCall: z.object({ id: z.number().int(), startedAt: z.date(), status: CallSessionStatusSchema }).nullable(),
});

// --- Manual enqueue ---

export const ManualEnqueueSchema = z.object({
  customerId: z.number().int().positive(),
  purchaseExperienceId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  sourceType: z.enum(["COMPLAINT", "CALLBACK", "MANUAL"]).optional(),
  priority: CallQueuePrioritySchema.optional(),
  reasonCode: z.string().trim().min(1).max(80).optional(),
  reasonSummary: z.string().trim().min(1).max(500).optional(),
});

export const ReassignSchema = z.object({ assignedToUserId: z.number().int().positive() });

// --- Agent lookup (contextual, branch-scoped, email-free) ---
// Powers the reassign-agent picker and the call-log agent filter without leaking
// the org-wide user directory. Mirrors the lookups' lightweight shape.
export const ListAgentsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
// id + display label + primary branch name only. Never email / roles / permissions.
// `label` is the user's name (`User.name` is nullable, so it may be empty).
export const AgentOptionSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  branchName: z.string().nullable(),
});

// --- Call session ---

export const CallSessionSchema = z.object({
  id: z.number().int(),
  queueItemId: z.number().int(),
  agentUserId: z.number().int(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationSeconds: z.number().int().nullable(),
  mode: z.enum(["MANUAL", "PROVIDER"]),
  status: CallSessionStatusSchema,
  outcome: CallOutcomeSchema.nullable(),
  recordingStatus: CallRecordingStatusSchema,
  wantsFurtherContact: z.boolean().nullable(),
  complaintRequested: z.boolean(),
});

export const CompleteCallSchema = z.object({
  outcome: CallOutcomeSchema,
  callbackAt: z.coerce.date().optional(),
  callbackTimezone: z.string().trim().min(1).max(60).optional(),
  wantsFurtherContact: z.boolean().optional(),
  internalNote: z.string().trim().max(2000).optional(),
  complaintRequested: z.boolean().optional(),
  complaintRequestReasonCodes: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const CompleteCallResultSchema = z.object({
  callSession: CallSessionSchema,
  queueStatus: CallQueueStatusSchema,
  callbackScheduled: z.boolean(),
  unreachable: z.boolean(),
});

// --- Callbacks ---

export const ListCallbacksQuerySchema = PaginationQuerySchema.extend({
  status: CallCallbackStatusSchema.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  agentUserId: z.coerce.number().int().positive().optional(),
  dueOnly: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  sort: z.string().optional(),
});
export const CallbackListItemSchema = z.object({
  id: z.number().int(),
  queueItemId: z.number().int(),
  scheduledAt: z.date(),
  timezone: z.string(),
  reason: CallCallbackReasonSchema,
  status: CallCallbackStatusSchema,
  previousAttempts: z.number().int(),
  customer: CustomerSummary,
  branch: BranchRef,
});

// --- Call log ---

export const ListCallsQuerySchema = PaginationQuerySchema.extend({
  agentUserId: z.coerce.number().int().positive().optional(),
  outcome: CallOutcomeSchema.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  hasRecording: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  complaintRequested: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  startedFrom: z.coerce.date().optional(),
  startedTo: z.coerce.date().optional(),
  sort: z.string().optional(),
});
export const CallLogItemSchema = z.object({
  id: z.number().int(),
  queueItemId: z.number().int(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationSeconds: z.number().int().nullable(),
  agentUserId: z.number().int(),
  // Additive: safe agent summary (id + displayName). `agentUserId` kept for
  // back-compat; the frontend renders `agent.displayName`, never the raw id.
  agent: AgentRef,
  outcome: CallOutcomeSchema.nullable(),
  status: CallSessionStatusSchema,
  recordingStatus: CallRecordingStatusSchema,
  complaintRequested: z.boolean(),
  customer: CustomerSummary,
  branch: BranchRef,
});
export const CallDetailSchema = CallLogItemSchema.extend({
  mode: z.enum(["MANUAL", "PROVIDER"]),
  wantsFurtherContact: z.boolean().nullable(),
  // Internal note only present when the caller holds calls.read (permissioned).
  internalNote: z.string().nullable(),
  sourceType: CallQueueSourceTypeSchema,
  vehicle: VehicleSummary,
});

// --- Overview / KPIs ---

export const OverviewSchema = z.object({
  callsToday: z.number().int(),
  customersFollowedUpToday: z.number().int(),
  pendingQueue: z.number().int(),
  dueCallbacks: z.number().int(),
  unreachableCount: z.number().int(),
  complaintRequests: z.number().int(),
  averageCallDurationSeconds: z.number().nullable(),
});

// --- Recording access ---

export const RecordingAccessSchema = z.object({
  callSessionId: z.number().int(),
  status: CallRecordingStatusSchema,
  url: z.string(),
  expiresAt: z.date(),
});

// --- Export ---

export const ExportQueueQuerySchema = ListQueueQuerySchema.extend({
  format: z.enum(["xlsx", "csv"]).optional(),
});
