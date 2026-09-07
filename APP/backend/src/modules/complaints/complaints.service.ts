import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { ComplaintPriority, ComplaintStage, ComplaintTimelineEventType, ComplaintSourceType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { withTransaction } from "src/lib/db/transaction";
import type { Tx } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { computeCycleTimes, DEFAULT_SLA_POLICIES, type SlaPolicySnapshot } from "src/modules/complaints/sla";
import { NON_GENERIC_TARGETS, qualifiesAsFirstResponse, REOPEN_STAGE } from "src/modules/complaints/state-machine";
import type { RoutingFacts } from "src/modules/complaints/routing";
import { createRoutingEngine } from "src/modules/complaints/routing-engine";
import { loadComplaintConfig } from "src/modules/complaints/config";
import { createComplaintNotificationsService } from "src/modules/complaints/complaint-notifications";
import {
  assigneeNotEligibleError, branchConflictError, categoryNotFoundError,
  complaintAlreadyClosedError, complaintNotFoundError, complaintNotOpenError,
  departmentRequiredError, escalationTargetInvalidError, escalationTargetOutOfScopeError,
  escalationTargetSameError, exportTooLargeError, invalidTransitionError, outOfScopeError,
  reopenNotAllowedError, resolutionRequiredError, revisionConflictError,
} from "src/modules/complaints/complaints.errors";
import type {
  CreateComplaintSchema, ListComplaintsQuerySchema, ListTimelineQuerySchema, CreateActionSchema,
  TransitionSchema, AssignSchema, ChangeDepartmentSchema, ChangePrioritySchema, ResolveSchema, CloseSchema,
  ReopenSchema, EscalateSchema, UpdateSolutionProposedSchema,
} from "src/modules/complaints/complaints.schema";

const A_LOCK = "complaint";
const EXPORT_LIMIT = 10_000;

/** What an escalation actually moved — handed back so the route can record the
 *  transfer in the audit log instead of a bare "escalated". */
export interface EscalationOutcome {
  escalationId: number;
  level: number;
  fromDepartmentId: number | null;
  toDepartmentId: number;
  fromUserId: number | null;
  toUserId: number | null;
}
const EVENTS = {
  CREATED: "complaint.created", ROUTED: "complaint.routed", ASSIGNED: "complaint.assigned",
  SLA_WARNING: "complaint.sla.warning", SLA_BREACHED: "complaint.sla.breached", ESCALATED: "complaint.escalated",
  ACTION_ADDED: "complaint.action_added", RESOLVED: "complaint.resolved", CLOSED: "complaint.closed", REOPENED: "complaint.reopened",
} as const;

// Scalar Complaint columns a client may sort by (whitelist — a raw field is never
// passed to Prisma; unknown falls back to the default). Relation/joined names
// (customer, assignee) are intentionally excluded — they can't go through [field].
const COMPLAINT_SORTABLE = [
  "openedAt", "updatedAt", "priority", "stage", "publicNumber", "closedAt", "slaResolutionDueAt",
] as const;

type Deps = { now?: () => Date };

export function createComplaintsService(fastify: FastifyInstance, deps: Deps = {}) {
  const prisma = fastify.prisma;
  const now = deps.now ?? (() => new Date());
  const routingEngine = createRoutingEngine(prisma);
  const complaintNotifications = createComplaintNotificationsService(fastify, { now });

  // --- Complaint access scope (hard, backend-enforced; the single authority for
  //     WHICH complaints a viewer may see). Permission = what they can DO; this
  //     scope = which complaints they can do it TO.
  //
  //     A complaint is visible iff the viewer is its ASSIGNEE, OR it is inside
  //     BOTH their branch scope AND their department scope. Each dimension is
  //     satisfied either by membership or by an explicit "view all" permission —
  //     so the two compose independently (all-branches + own-departments, etc.).
  //     `complaints.read` alone grants NOTHING here: scope is separate.
  type Scope = {
    allBranches: boolean;
    branchIds: number[];
    allDepartments: boolean;
    departmentIds: number[];
    viewerId: number;
  };
  async function resolveScope(viewer: AuthUser): Promise<Scope> {
    const allBranches = hasPermission(viewer, PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES);
    const allDepartments = hasPermission(viewer, PERMISSIONS.COMPLAINTS_VIEW_ALL_DEPARTMENTS);
    const [branches, depts] = await Promise.all([
      allBranches ? Promise.resolve([]) : prisma.userBranchAssignment.findMany({ where: { userId: viewer.id }, select: { branchId: true } }),
      allDepartments ? Promise.resolve([]) : prisma.userDepartmentAssignment.findMany({ where: { userId: viewer.id }, select: { departmentId: true } }),
    ]);
    return {
      allBranches,
      branchIds: branches.map((r) => r.branchId),
      allDepartments,
      departmentIds: depts.map((r) => r.departmentId),
      viewerId: viewer.id,
    };
  }

  /** True when the viewer may see THIS complaint (detail / mutation guard). */
  function inScope(scope: Scope, c: { branchId: number | null; departmentId: number | null; assignedToUserId: number | null }): boolean {
    if (c.assignedToUserId != null && c.assignedToUserId === scope.viewerId) return true; // responsibility
    const branchOk = scope.allBranches || (c.branchId != null && scope.branchIds.includes(c.branchId));
    const deptOk = scope.allDepartments || (c.departmentId != null && scope.departmentIds.includes(c.departmentId));
    return branchOk && deptOk;
  }

  /**
   * The scope as a Prisma `WHERE` fragment, to merge into any complaint query.
   * `{}` means unrestricted (viewer sees everything). Otherwise it is
   * `OR[ assignee , AND[ branch , department ] ]`. Empty membership arrays yield
   * `{ in: [] }` → the viewer sees only complaints assigned to them, never all.
   */
  function scopeWhere(scope: Scope): Prisma.ComplaintWhereInput {
    if (scope.allBranches && scope.allDepartments) return {};
    const branchGuard: Prisma.ComplaintWhereInput = scope.allBranches ? {} : { branchId: { in: scope.branchIds } };
    const deptGuard: Prisma.ComplaintWhereInput = scope.allDepartments ? {} : { departmentId: { in: scope.departmentIds } };
    return { OR: [{ assignedToUserId: scope.viewerId }, { AND: [branchGuard, deptGuard] }] };
  }

  /** Merge the scope guard into a complaint `where` (AND-combined, never widening). */
  function scoped(scope: Scope, where: Prisma.ComplaintWhereInput = {}): Prisma.ComplaintWhereInput {
    const sw = scopeWhere(scope);
    if (Object.keys(sw).length === 0) return where;
    const existingAnd = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
    return { ...where, AND: [...existingAnd, sw] };
  }
  const includesPhone = (viewer: AuthUser) => hasPermission(viewer, PERMISSIONS.CALL_CENTER_CONTACTS_READ);

  // --- Projections ---
  function maskPhone(mobile: string | null): string | null {
    if (!mobile) return null;
    const digits = mobile.replace(/\D/g, "");
    return digits.length < 4 ? null : `••••${digits.slice(-4)}`;
  }
  function customerSummary(c: { id: number; name: string; mobile: string | null }, includePhone: boolean) {
    return { id: c.id, name: c.name, maskedPhone: maskPhone(c.mobile), phone: includePhone ? c.mobile : null };
  }
  const ref = (r: { id: number; name: string } | null | undefined) => (r ? { id: r.id, name: r.name } : null);

  function slaSummary(c: { slaFirstResponseDueAt: Date | null; slaResolutionDueAt: Date | null; slaWarnAt: Date | null; isLate: boolean; lifecycleStatus: string }) {
    const remaining = c.slaResolutionDueAt && c.lifecycleStatus === "OPEN"
      ? Math.round((c.slaResolutionDueAt.getTime() - now().getTime()) / 60000) : null;
    return { firstResponseDueAt: c.slaFirstResponseDueAt, resolutionDueAt: c.slaResolutionDueAt, warnAt: c.slaWarnAt, isLate: c.isLate, remainingMinutes: remaining };
  }

  // `assignedTo` is a real relation (Complaint.assignedTo → User) → a single SQL
  // JOIN gives the assignee's display name with NO extra query and NO per-row N+1.
  const LIST_INCLUDE = {
    customer: { select: { id: true, name: true, mobile: true } },
    category: { select: { id: true, nameEn: true } },
    branch: { select: { id: true, name: true } },
    department: { select: { id: true, name: true } },
    assignedTo: { select: { id: true, name: true } },
  } satisfies Prisma.ComplaintInclude;
  type ListRow = Prisma.ComplaintGetPayload<{ include: typeof LIST_INCLUDE }>;

  /** PII-free SafeUserRef from a joined user relation (id + display name only). */
  const userRef = (u: { id: number; name: string | null } | null | undefined) =>
    u && u.name && u.name.trim() ? { id: u.id, displayName: u.name.trim() } : null;

  /** Batched, deduped SafeUserRef resolver — ONE query for ALL ids (never per row).
   *  Used where there is no Prisma relation to JOIN (timeline actors). Deleted /
   *  unknown / name-less users are omitted so the caller renders a neutral fallback. */
  async function resolveUserRefs(ids: ReadonlyArray<number | null | undefined>): Promise<Map<number, { id: number; displayName: string }>> {
    const uniq = [...new Set(ids.filter((x): x is number => typeof x === "number" && x > 0))];
    const map = new Map<number, { id: number; displayName: string }>();
    if (uniq.length === 0) return map;
    const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
    for (const u of users) { const r = userRef(u); if (r) map.set(u.id, r); }
    return map;
  }

  function toListItem(c: ListRow, includePhone: boolean) {
    return {
      id: c.id, publicNumber: c.publicNumber, customer: customerSummary(c.customer, includePhone),
      category: c.category ? { id: c.category.id, name: c.category.nameEn } : null, branch: ref(c.branch), department: ref(c.department),
      assignedToUserId: c.assignedToUserId, assignee: userRef(c.assignedTo), priority: c.priority, lifecycleStatus: c.lifecycleStatus, stage: c.stage,
      routingStatus: c.routingStatus, sourceType: c.sourceType, isEscalated: c.isEscalated, escalationLevel: c.escalationLevel,
      sla: slaSummary(c), openedAt: c.openedAt, revision: c.revision,
    };
  }

  // --- Shared: timeline, first-response, SLA snapshot ---
  async function addTimeline(tx: Tx, complaintId: number, type: ComplaintTimelineEventType, actorUserId: number | null, metadata?: Record<string, unknown>) {
    await tx.complaintTimelineEvent.create({ data: { complaintId, type, actorUserId, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined } });
  }

  async function currentCycle(tx: Tx, complaintId: number) {
    return tx.complaintSlaCycle.findFirst({ where: { complaintId, closedAt: null }, orderBy: { cycleNumber: "desc" } });
  }

  async function slaPolicyFor(tx: Tx, priority: ComplaintPriority): Promise<SlaPolicySnapshot & { breachEscalationDelayMinutes: number | null }> {
    const p = await tx.complaintSlaPolicy.findUnique({ where: { priority } });
    if (p) return p;
    const d = DEFAULT_SLA_POLICIES[priority];
    return { firstResponseMinutes: d.firstResponseMinutes, resolutionMinutes: d.resolutionMinutes, warningBeforeMinutes: d.warningBeforeMinutes, breachEscalationDelayMinutes: d.breachEscalationDelayMinutes };
  }

  async function startCycle(tx: Tx, complaintId: number, priority: ComplaintPriority, cycleNumber: number, startedAt: Date) {
    const policy = await slaPolicyFor(tx, priority);
    const times = computeCycleTimes(policy, startedAt);
    await tx.complaintSlaCycle.create({
      data: {
        complaintId, cycleNumber, prioritySnapshot: priority,
        firstResponseMinutes: policy.firstResponseMinutes, resolutionMinutes: policy.resolutionMinutes, warningBeforeMinutes: policy.warningBeforeMinutes,
        startedAt, firstResponseDueAt: times.firstResponseDueAt, resolutionDueAt: times.resolutionDueAt, warningAt: times.warningAt,
      },
    });
    return { times, cycleNumber };
  }

  async function markFirstResponse(tx: Tx, complaint: { id: number; firstRespondedAt: Date | null }, actorUserId: number | null) {
    if (complaint.firstRespondedAt) return;
    const at = now();
    await tx.complaint.update({ where: { id: complaint.id }, data: { firstRespondedAt: at } });
    const cyc = await currentCycle(tx, complaint.id);
    if (cyc && !cyc.firstRespondedAt) await tx.complaintSlaCycle.update({ where: { id: cyc.id }, data: { firstRespondedAt: at } });
    await addTimeline(tx, complaint.id, "FIRST_RESPONSE", actorUserId);
  }

  // --- Notifications (audience resolution FIRST, then channel prefs via notify.send) ---
  async function activeIds(ids: Iterable<number>): Promise<number[]> {
    const set = [...new Set(ids)];
    if (set.length === 0) return [];
    const active = await prisma.user.findMany({ where: { id: { in: set }, status: "ACTIVE" }, select: { id: true } });
    return active.map((u) => u.id);
  }
  async function permissionHolders(permKey: string): Promise<number[]> {
    const rows = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: permKey } } } } } } }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  /**
   * The notification audience for a department (§10). A recipient must:
   *  • be ACTIVE,
   *  • be a member of the department (optionally a manager),
   *  • hold `complaints.read` (the minimum operational capability — no read, no
   *    notification, §15),
   *  • be in the complaint's BRANCH, or hold cross-branch access (§5).
   * One bounded query — no N+1. Never notifies unrelated-department, out-of-branch,
   * inactive, or read-less users.
   */
  async function deptAudience(departmentId: number | null, branchId: number | null, managersOnly: boolean): Promise<number[]> {
    if (!departmentId) return [];
    const rows = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        departmentAssignments: { some: { departmentId, ...(managersOnly ? { isManager: true } : {}) } },
        roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.COMPLAINTS_READ } } } } } },
        ...(branchId != null
          ? { OR: [{ branchAssignments: { some: { branchId } } }, { roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES } } } } } } }] }
          : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  async function branchManager(branchId: number | null): Promise<number[]> {
    if (!branchId) return [];
    const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { managerUserId: true } });
    return b?.managerUserId ? [b.managerUserId] : [];
  }

  async function resolveAudience(eventKey: string, c: { assignedToUserId: number | null; departmentId: number | null; branchId: number | null; priority: ComplaintPriority; escalationLevel: number }): Promise<number[]> {
    const ids = new Set<number>();
    if (c.assignedToUserId) ids.add(c.assignedToUserId);
    switch (eventKey) {
      case EVENTS.CREATED:
      case EVENTS.ROUTED:
        (await deptAudience(c.departmentId, c.branchId, false)).forEach((i) => ids.add(i));
        (await branchManager(c.branchId)).forEach((i) => ids.add(i));
        break;
      case EVENTS.ASSIGNED:
        break; // assignee only (already added)
      case EVENTS.SLA_WARNING:
      case EVENTS.ACTION_ADDED:
        (await deptAudience(c.departmentId, c.branchId, true)).forEach((i) => ids.add(i));
        break;
      case EVENTS.SLA_BREACHED:
        (await deptAudience(c.departmentId, c.branchId, true)).forEach((i) => ids.add(i));
        (await branchManager(c.branchId)).forEach((i) => ids.add(i));
        if (c.priority === "CRITICAL") (await permissionHolders(PERMISSIONS.COMPLAINTS_ESCALATIONS_EXECUTIVE_RECEIVE)).forEach((i) => ids.add(i));
        break;
      case EVENTS.ESCALATED:
        (await deptAudience(c.departmentId, c.branchId, true)).forEach((i) => ids.add(i));
        (await branchManager(c.branchId)).forEach((i) => ids.add(i));
        if (c.escalationLevel >= 2 || c.priority === "CRITICAL") {
          (await permissionHolders(PERMISSIONS.COMPLAINTS_ESCALATIONS_CX_RECEIVE)).forEach((i) => ids.add(i));
          (await permissionHolders(PERMISSIONS.COMPLAINTS_ESCALATIONS_EXECUTIVE_RECEIVE)).forEach((i) => ids.add(i));
        }
        break;
      case EVENTS.RESOLVED:
      case EVENTS.CLOSED:
      case EVENTS.REOPENED:
        (await deptAudience(c.departmentId, c.branchId, true)).forEach((i) => ids.add(i));
        break;
    }
    return activeIds(ids);
  }

  /**
   * Non-blocking notify. Ordering: resolve audience → admin channel rule
   * (ComplaintNotificationSetting) → per-user prefs. IN_APP is delivered
   * synchronously (idempotent); EMAIL is enqueued to the durable outbox and sent
   * by the worker via the central provider. A failure here NEVER breaks the
   * complaint transaction (best-effort, logged).
   */
  async function notify(eventKey: string, complaintId: number, c: { publicNumber: string; assignedToUserId: number | null; departmentId: number | null; branchId: number | null; priority: ComplaintPriority; escalationLevel: number }, dedupeSuffix?: string) {
    try {
      const userIds = await resolveAudience(eventKey, c);
      if (userIds.length === 0) return;
      const enabled = await complaintNotifications.getEnabledChannels(eventKey);
      // IN_APP — admin-gated; the generic pipeline still applies per-user prefs + dedupe.
      if (enabled.has("IN_APP")) {
        await fastify.notify.send({
          eventKey, userIds, channels: ["IN_APP"],
          title: `Complaint ${c.publicNumber}`, body: `Complaint ${c.publicNumber}: ${eventKey}`,
          data: { complaintId, publicNumber: c.publicNumber, eventKey },
          dedupeKeyPrefix: `${eventKey}:${complaintId}${dedupeSuffix ? `:${dedupeSuffix}` : ""}`,
        });
      }
      // EMAIL — admin-gated; durable outbox, sent by the worker.
      if (enabled.has("EMAIL")) {
        await complaintNotifications.enqueueEmails({ eventKey, complaintId, dedupeSuffix, userIds });
      }
    } catch (err) { fastify.log.error({ err, eventKey, complaintId }, "complaint notification failed"); }
  }

  // --- Core creation (manual + automatic share this) ---
  interface CreateCoreInput {
    customerId: number; purchaseExperienceId: number | null; branchId: number | null;
    categoryId: number | null; departmentId: number | null; priority: ComplaintPriority;
    sourceType: ComplaintSourceType; sourceId: string | null; routed: boolean;
    routingRuleId: number | null; routingSnapshot: Record<string, unknown> | null;
    description: string | null; actorUserId: number | null; assignedToUserId?: number | null;
  }
  async function createCore(tx: Tx, input: CreateCoreInput) {
    const temp = `TMP-${randomUUID()}`;
    const created = await tx.complaint.create({
      data: {
        publicNumber: temp, customerId: input.customerId, purchaseExperienceId: input.purchaseExperienceId, branchId: input.branchId,
        categoryId: input.categoryId, departmentId: input.departmentId, assignedToUserId: input.assignedToUserId ?? null,
        priority: input.priority, sourceType: input.sourceType, sourceId: input.sourceId,
        routingStatus: input.routed ? "ROUTED" : "UNROUTED", routingRuleId: input.routingRuleId,
        routingSnapshot: (input.routingSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        description: input.description, stage: input.departmentId ? "IN_PROGRESS" : "NEW", openedAt: now(),
        summaryStatus: "GENERATED", systemSummary: buildSystemSummary(input),
      },
    });
    const publicNumber = `CMP-${String(created.id).padStart(6, "0")}`;
    const times = await startCycle(tx, created.id, input.priority, 1, created.openedAt);
    const complaint = await tx.complaint.update({
      where: { id: created.id },
      data: { publicNumber, slaCurrentCycleNumber: 1, slaFirstResponseDueAt: times.times.firstResponseDueAt, slaResolutionDueAt: times.times.resolutionDueAt, slaWarnAt: times.times.warningAt },
    });
    await addTimeline(tx, created.id, "COMPLAINT_OPENED", input.actorUserId, { sourceType: input.sourceType, sourceId: input.sourceId });
    if (input.routed) await addTimeline(tx, created.id, "ROUTED", input.actorUserId, { routingRuleId: input.routingRuleId, departmentId: input.departmentId, categoryId: input.categoryId, priority: input.priority });
    if (input.assignedToUserId) await addTimeline(tx, created.id, "ASSIGNED", input.actorUserId, { assignedToUserId: input.assignedToUserId });
    return complaint;
  }

  function buildSystemSummary(input: CreateCoreInput): string {
    const parts = [`Source: ${input.sourceType}`];
    if (input.categoryId) parts.push(`Category #${input.categoryId}`);
    if (input.branchId) parts.push(`Branch #${input.branchId}`);
    if (!input.routed) parts.push("Needs manual triage (unrouted)");
    return parts.join(" · ");
  }

  // --- Routing (delegates to the shared engine) ---
  const routeFacts = routingEngine.routeFacts;

  // --- Manual creation ---
  async function createManual(input: z.infer<typeof CreateComplaintSchema>, viewer: AuthUser, idempotencyKey?: string) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
    if (!customer) throw complaintNotFoundError();
    let branchId = input.branchId ?? null;
    let experienceBranch: number | null = null;
    if (input.purchaseExperienceId) {
      const exp = await prisma.purchaseExperience.findUnique({ where: { id: input.purchaseExperienceId }, select: { branchId: true } });
      experienceBranch = exp?.branchId ?? null;
      if (experienceBranch != null) {
        if (branchId != null && branchId !== experienceBranch && !input.allowBranchOverride) throw branchConflictError();
        if (branchId == null) branchId = experienceBranch;
      }
    }
    const scope = await resolveScope(viewer);
    // Create is gated on BRANCH scope (the operator may open a case for a branch
    // they cover). The department is the routing target, not a create restriction.
    if (!scope.allBranches && (branchId == null || !scope.branchIds.includes(branchId))) throw outOfScopeError();

    const categoryId = input.categoryId ?? null;
    let priority: ComplaintPriority = input.priority ?? "MEDIUM";
    let categoryDefaultDept: number | null = null;
    if (categoryId) {
      const cat = await prisma.complaintCategory.findUnique({ where: { id: categoryId }, select: { id: true, defaultDepartmentId: true, defaultPriority: true } });
      if (!cat) throw categoryNotFoundError();
      categoryDefaultDept = cat.defaultDepartmentId;
      if (input.priority == null && cat.defaultPriority) priority = cat.defaultPriority;
    }
    // DEPARTMENT-FIRST: the department is the routing target — chosen explicitly,
    // else the category default. The employee is chosen FROM that department and,
    // when given, must be an eligible member of it (and of the complaint's
    // branch). Department is never derived from the employee.
    const departmentId = input.departmentId ?? categoryDefaultDept;
    if (input.assignedToUserId != null) {
      const ok = await isAssigneeEligible(input.assignedToUserId, departmentId, branchId);
      if (!ok) throw assigneeNotEligibleError("assignee not eligible for department/branch");
    }
    const sourceId = idempotencyKey ? `manual:${idempotencyKey}` : `manual:${randomUUID()}`;

    // Idempotency check BEFORE the transaction (re-querying an aborted tx fails).
    const prior = await prisma.complaint.findFirst({ where: { sourceType: "MANUAL", sourceId }, select: { id: true } });
    if (prior) return detailById(prior.id, viewer);
    let complaint;
    try {
      complaint = await withTransaction(prisma, (tx) => createCore(tx, {
        customerId: input.customerId, purchaseExperienceId: input.purchaseExperienceId ?? null, branchId,
        categoryId, departmentId, priority, sourceType: "MANUAL", sourceId, routed: departmentId != null,
        routingRuleId: null, routingSnapshot: null, description: input.description, actorUserId: viewer.id, assignedToUserId: input.assignedToUserId ?? null,
      }));
    } catch (err) {
      if (isUniqueViolation(err)) { const e = await prisma.complaint.findFirst({ where: { sourceType: "MANUAL", sourceId }, select: { id: true } }); if (e) return detailById(e.id, viewer); }
      throw err;
    }
    await notify(departmentId ? EVENTS.ROUTED : EVENTS.CREATED, complaint.id, complaint);
    return detailById(complaint.id, viewer);
  }

  /**
   * The department a complaint inherits from its assignee.
   *
   * Membership is many-to-many (`UserDepartmentAssignment`), so a user can belong
   * to several departments — or none (a global-access user). The rule, agreed
   * with the product owner: prefer the department the user MANAGES, then the
   * earliest assignment; a user with no department yields null. Deterministic, no
   * new schema. This is the ONLY source of a complaint's department on the manual
   * paths now — the operator never picks it.
   *
   * Accepts a tx client so the reassign path can derive inside its transaction;
   * `prisma` (a superset of `Prisma.TransactionClient`) is passed on the create
   * path, where a request cannot race the user's own membership.
   */
  async function departmentForAssignee(
    client: Prisma.TransactionClient,
    userId: number,
  ): Promise<number | null> {
    const row = await client.userDepartmentAssignment.findFirst({
      where: { userId },
      orderBy: [{ isManager: "desc" }, { id: "asc" }],
      select: { departmentId: true },
    });
    return row?.departmentId ?? null;
  }

  async function isAssigneeEligible(userId: number, departmentId: number | null, branchId: number | null): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") return false;
    // Global complaint access → always eligible.
    const global = await prisma.user.count({ where: { id: userId, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES } } } } } } } });
    if (global > 0) return true;
    if (departmentId != null) {
      const inDept = await prisma.userDepartmentAssignment.count({ where: { userId, departmentId } });
      if (inDept === 0) return false;
    }
    if (branchId != null) {
      const inBranch = await prisma.userBranchAssignment.count({ where: { userId, branchId } });
      if (inBranch === 0) return false;
    }
    return true;
  }

  /**
   * The employees eligible to take a complaint IN a given department (§22).
   *
   * DEPARTMENT-FIRST: the list is the department's own members, intersected with
   * branch scope — never every system user. One bounded query with two nested
   * take-1 selects (department + branch name), so the cost is flat, no N+1.
   *
   * Eligibility mirrors `isAssigneeEligible`: ACTIVE, a member of the department,
   * and — when the complaint has a branch — a member of that branch OR holding
   * global complaint access. The branch is first intersected with the VIEWER's
   * own scope, so a branch-scoped operator can never enumerate staff outside it.
   */
  async function assigneeOptions(viewer: AuthUser, query: { departmentId?: number | null; branchId?: number | null; search?: string; limit?: number }) {
    const scope = await resolveScope(viewer);
    const departmentId = query.departmentId ?? null;
    const branchId = query.branchId ?? null;
    // The viewer may only enumerate a department they can see, and a branch in
    // their scope — otherwise the picker becomes a directory of unrelated staff.
    if (departmentId != null && !scope.allDepartments && !scope.departmentIds.includes(departmentId)) return { items: [] };
    if (branchId != null && !scope.allBranches && !scope.branchIds.includes(branchId)) return { items: [] };
    // With no department given, the list spans every department the viewer can see.
    const deptClause =
      departmentId != null
        ? { departmentAssignments: { some: { departmentId } } }
        : scope.allDepartments
          ? {}
          : { departmentAssignments: { some: { departmentId: { in: scope.departmentIds } } } };
    // With no branch given, a branch-scoped viewer still only sees their branches.
    const branchClause =
      branchId != null
        ? { OR: [{ branchAssignments: { some: { branchId } } }, { roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES } } } } } } }] }
        : scope.allBranches
          ? {}
          : { branchAssignments: { some: { branchId: { in: scope.branchIds } } } };

    const users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        ...deptClause,
        ...branchClause,
        ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: query.limit ?? 50,
      select: {
        id: true,
        name: true,
        departmentAssignments: departmentId != null
          ? { where: { departmentId }, take: 1, select: { department: { select: { name: true } } } }
          : { take: 1, orderBy: { id: "asc" }, select: { department: { select: { name: true } } } },
        branchAssignments: branchId != null
          ? { where: { branchId }, take: 1, select: { branch: { select: { name: true } } } }
          : { take: 1, orderBy: { id: "asc" }, select: { branch: { select: { name: true } } } },
      },
    });

    return {
      items: users.map((u) => ({
        userId: u.id,
        name: u.name ?? "",
        departmentName: u.departmentAssignments[0]?.department.name ?? null,
        branchName: u.branchAssignments[0]?.branch.name ?? null,
      })),
    };
  }

  // --- Load with scope ---
  async function loadScoped(id: number, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const c = await prisma.complaint.findUnique({ where: { id } });
    if (!c || !inScope(scope, c)) throw complaintNotFoundError();
    return c;
  }

  // --- Reads ---
  function listWhere(query: z.infer<typeof ListComplaintsQuerySchema>, scope: Scope): Prisma.ComplaintWhereInput {
    const where: Prisma.ComplaintWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.isLate !== undefined ? { isLate: query.isLate } : {}),
      ...(query.isEscalated !== undefined ? { isEscalated: query.isEscalated } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.openedFrom || query.openedTo ? { openedAt: { ...(query.openedFrom ? { gte: query.openedFrom } : {}), ...(query.openedTo ? { lte: query.openedTo } : {}) } } : {}),
      // A requested branch is a NARROWING filter within scope, never a widener.
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.search ? { OR: [{ publicNumber: { contains: query.search, mode: "insensitive" } }, { customer: { name: { contains: query.search, mode: "insensitive" } } }] } : {}),
    };
    // The access scope (branch + department + assignee) is ANDed in — the search
    // OR and any requested filters are all constrained by it.
    return scoped(scope, where);
  }

  async function list(query: z.infer<typeof ListComplaintsQuerySchema>, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const where = listWhere(query, scope);
    const includePhone = includesPhone(viewer);
    const { field, direction } = parseSort(query.sort, COMPLAINT_SORTABLE, { field: "openedAt", direction: "desc" });
    const orderBy = { [field]: direction } as Prisma.ComplaintOrderByWithRelationInput;
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.complaint.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.complaint.findMany({ where, include: LIST_INCLUDE, orderBy, skip, take });
        return rows.map((r) => toListItem(r, includePhone));
      },
    });
  }

  async function detailById(id: number, viewer: AuthUser) {
    const includePhone = includesPhone(viewer);
    const c = await prisma.complaint.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        purchaseExperience: { include: { vehicle: { include: { model: { select: { name: true } } } }, salesperson: { select: { name: true } } } },
        timeline: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, type: true, actorUserId: true, createdAt: true } },
      },
    });
    if (!c) throw complaintNotFoundError();
    // Original customer comment (only for authorized viewer; referenced, not duplicated in logs).
    const customerComment: string | null = null;
    const previewActors = await resolveUserRefs(c.timeline.map((t) => t.actorUserId));
    return {
      ...toListItem(c, includePhone),
      purchaseExperience: c.purchaseExperience ? { id: c.purchaseExperience.id, deliveryDate: c.purchaseExperience.deliveryDate, vehicleModel: c.purchaseExperience.vehicle.vehicleName ?? c.purchaseExperience.vehicle.model?.name ?? null, vehicleYear: c.purchaseExperience.vehicle.modelYear, vin: c.purchaseExperience.vehicle.vin, salespersonName: c.purchaseExperience.salesperson?.name ?? null } : null,
      sourceId: c.sourceId, description: c.description, systemSummary: c.systemSummary, summaryStatus: c.summaryStatus,
      customerComment, firstRespondedAt: c.firstRespondedAt, resolvedAt: c.resolvedAt, resolutionSummary: c.resolutionSummary,
      solutionProposed: c.solutionProposed, closedAt: c.closedAt, reopenedCount: c.reopenedCount, escalatedAt: c.escalatedAt,
      routingRuleId: c.routingRuleId, routingSnapshot: (c.routingSnapshot as Record<string, unknown> | null) ?? null,
      timelinePreview: c.timeline.map((t) => ({ ...t, actor: t.actorUserId ? previewActors.get(t.actorUserId) ?? null : null })),
      waitingReason: c.waitingReason, waitingReasonNote: c.waitingReasonNote,
    };
  }

  async function detail(id: number, viewer: AuthUser) {
    await loadScoped(id, viewer);
    return detailById(id, viewer);
  }

  /**
   * Turn the id-only metadata of transfer events into readable names, for a
   * whole page of timeline rows at once. Two queries total regardless of page
   * size. Unknown ids simply resolve to nothing rather than to a fake label —
   * a department that was deleted reads as absent, not as "#17".
   */
  async function resolveTransferNames(all: (Record<string, unknown> | null)[]): Promise<(Record<string, unknown> | null)[]> {
    const DEPT_KEYS = ["fromDepartmentId", "toDepartmentId", "from", "to"] as const;
    const USER_KEYS = ["fromUserId", "toUserId"] as const;
    const deptIds = new Set<number>();
    const userIds = new Set<number>();
    for (const m of all) {
      if (!m) continue;
      // `from`/`to` are department ids ONLY on DEPARTMENT_CHANGED; elsewhere they
      // may be stages/priorities (strings), which this ignores by type.
      for (const k of DEPT_KEYS) if (typeof m[k] === "number") deptIds.add(m[k] as number);
      for (const k of USER_KEYS) if (typeof m[k] === "number") userIds.add(m[k] as number);
    }
    if (deptIds.size === 0 && userIds.size === 0) return all;
    const [depts, users] = await Promise.all([
      deptIds.size ? prisma.department.findMany({ where: { id: { in: [...deptIds] } }, select: { id: true, name: true } }) : [],
      userIds.size ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }) : [],
    ]);
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    const userName = new Map(users.map((u) => [u.id, u.name]));
    return all.map((m) => {
      if (!m) return m;
      const out = { ...m };
      const put = (key: string, value: string | undefined) => { if (value) out[key] = value; };
      put("fromDepartment", typeof m.fromDepartmentId === "number" ? deptName.get(m.fromDepartmentId) : undefined);
      put("toDepartment", typeof m.toDepartmentId === "number" ? deptName.get(m.toDepartmentId) : undefined);
      put("fromDepartment", typeof m.from === "number" ? deptName.get(m.from) : undefined);
      put("toDepartment", typeof m.to === "number" ? deptName.get(m.to) : undefined);
      put("fromUser", typeof m.fromUserId === "number" ? (userName.get(m.fromUserId) ?? undefined) : undefined);
      put("toUser", typeof m.toUserId === "number" ? (userName.get(m.toUserId) ?? undefined) : undefined);
      return out;
    });
  }

  async function timeline(id: number, query: z.infer<typeof ListTimelineQuerySchema>, viewer: AuthUser) {
    await loadScoped(id, viewer);
    const where = { complaintId: id };
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.complaintTimelineEvent.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.complaintTimelineEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: { id: true, type: true, actorUserId: true, metadata: true, createdAt: true } });
        const actors = await resolveUserRefs(rows.map((r) => r.actorUserId));
        // A transfer event (ESCALATED / DEPARTMENT_CHANGED) stores only ids —
        // correct for an immutable record, useless to a reader. Resolve those ids
        // to NAMES here, in two batched queries for the whole page (no N+1), and
        // hand them over as plain string metadata so the UI never renders "#42".
        const enriched = await resolveTransferNames(rows.map((r) => (r.metadata as Record<string, unknown> | null) ?? null));
        return rows.map((r, i) => ({
          id: r.id, type: r.type as string, actorUserId: r.actorUserId,
          actor: r.actorUserId ? actors.get(r.actorUserId) ?? null : null,
          metadata: enriched[i] ?? ((r.metadata as Record<string, unknown> | null) ?? null),
          createdAt: r.createdAt,
        }));
      },
    });
  }

  async function similar(id: number, viewer: AuthUser) {
    const c = await loadScoped(id, viewer);
    const scope = await resolveScope(viewer);
    const rows = await prisma.complaint.findMany({
      where: scoped(scope, {
        id: { not: id },
        OR: [
          ...(c.categoryId ? [{ categoryId: c.categoryId }] : []),
          ...(c.branchId ? [{ branchId: c.branchId }] : []),
        ],
      }),
      orderBy: { openedAt: "desc" }, take: 8,
      select: { id: true, publicNumber: true, categoryId: true, stage: true, priority: true, lifecycleStatus: true, isLate: true, openedAt: true, customer: { select: { name: true } }, branch: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id, publicNumber: r.publicNumber, categoryId: r.categoryId,
      customerName: r.customer?.name ?? null, branchName: r.branch?.name ?? null,
      stage: r.stage, priority: r.priority, lifecycleStatus: r.lifecycleStatus, isLate: r.isLate, openedAt: r.openedAt,
    }));
  }

  // --- Lifecycle mutations (revision CAS + advisory lock + timeline + notify) ---
  async function mutate<T>(id: number, expectedRevision: number, viewer: AuthUser, fn: (tx: Tx, c: Prisma.ComplaintGetPayload<object>) => Promise<T>) {
    const scope = await resolveScope(viewer);
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, A_LOCK, id);
      const c = await tx.complaint.findUnique({ where: { id } });
      if (!c || !inScope(scope, c)) throw complaintNotFoundError();
      if (c.revision !== expectedRevision) throw revisionConflictError(expectedRevision, c.revision);
      return fn(tx, c);
    });
  }

  async function transition(id: number, body: z.infer<typeof TransitionSchema>, viewer: AuthUser) {
    await mutate(id, body.revision, viewer, async (tx, c) => {
      // The processing stage is a FREE operational position — an authorized user may
      // set ANY operational stage directly, in any order (no mandatory sequence, no
      // transition matrix). The only guards are the lifecycle protections that
      // predate this: RESOLVED/CLOSED are formal lifecycle actions reached ONLY via
      // resolve/close (never the stage picker), and a non-OPEN complaint's stage is
      // frozen. Permission + scope are enforced upstream (route perm + `mutate`).
      if (c.lifecycleStatus !== "OPEN") throw complaintNotOpenError(c.lifecycleStatus);
      if (NON_GENERIC_TARGETS.includes(body.toStage)) throw invalidTransitionError(c.stage, body.toStage);
      const sameStage = body.toStage === c.stage;
      // The pause reason lives on the complaint only while WAITING; any move to a
      // non-WAITING stage clears it. Moving to (or staying in) WAITING may update it.
      const toWaiting = body.toStage === "WAITING";
      const waitingReason = toWaiting ? body.waitingReason ?? null : null;
      const waitingReasonNote = toWaiting ? body.waitingReasonNote ?? null : null;
      const reasonChanged = toWaiting && (waitingReason !== c.waitingReason || waitingReasonNote !== c.waitingReasonNote);
      if (sameStage && !reasonChanged) return; // no-op — nothing to record
      await tx.complaint.update({ where: { id }, data: { stage: body.toStage, waitingReason, waitingReasonNote, revision: { increment: 1 } } });
      await addTimeline(tx, id, "STAGE_CHANGED", viewer.id, { from: c.stage, to: body.toStage, ...(toWaiting ? { waitingReason, waitingReasonNote } : {}) });
      if (!sameStage && qualifiesAsFirstResponse(body.toStage)) await markFirstResponse(tx, c, viewer.id);
    });
    return detailById(id, viewer);
  }

  async function assign(id: number, body: z.infer<typeof AssignSchema>, viewer: AuthUser) {
    const c0 = await loadScoped(id, viewer);
    // DEPARTMENT-FIRST: `assign` changes the EMPLOYEE within the complaint's
    // current department. The new employee must be an eligible member of that
    // department (and branch). Moving a case to another department is a distinct
    // operation — `changeDepartment` — which clears an assignee no longer eligible
    // there. So `assign` never changes `departmentId`.
    if (!(await isAssigneeEligible(body.assignedToUserId, c0.departmentId, c0.branchId))) throw assigneeNotEligibleError("assignee not eligible for department/branch");
    await mutate(id, body.revision, viewer, async (tx, c) => {
      const previous = c.assignedToUserId;
      // Assignment is a timeline event, NOT a stage (§8). It only nudges a still-NEW
      // case into IN_PROGRESS (handling has begun); any other stage is left as-is.
      const stage: ComplaintStage = c.stage === "NEW" ? "IN_PROGRESS" : c.stage;
      await tx.complaint.update({ where: { id }, data: { assignedToUserId: body.assignedToUserId, stage, revision: { increment: 1 } } });
      await addTimeline(tx, id, previous ? "REASSIGNED" : "ASSIGNED", viewer.id, { previousAssigneeId: previous, newAssigneeId: body.assignedToUserId });
      await markFirstResponse(tx, c, viewer.id);
    });
    const c = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    await notify(EVENTS.ASSIGNED, id, c);
    return detailById(id, viewer);
  }

  const reassign = assign;

  async function changeDepartment(id: number, body: z.infer<typeof ChangeDepartmentSchema>, viewer: AuthUser) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId }, select: { id: true } });
    if (!dept) throw departmentRequiredError();
    await mutate(id, body.revision, viewer, async (tx, c) => {
      // Clear an assignee that is no longer eligible for the new department.
      let assignee = c.assignedToUserId;
      if (assignee && !(await isAssigneeEligible(assignee, body.departmentId, c.branchId))) assignee = null;
      await tx.complaint.update({ where: { id }, data: { departmentId: body.departmentId, assignedToUserId: assignee, routingStatus: "ROUTED", revision: { increment: 1 } } });
      await addTimeline(tx, id, "DEPARTMENT_CHANGED", viewer.id, { from: c.departmentId, to: body.departmentId, assigneeCleared: assignee == null && c.assignedToUserId != null });
    });
    const c = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    await notify(EVENTS.ROUTED, id, c);
    return detailById(id, viewer);
  }

  async function changePriority(id: number, body: z.infer<typeof ChangePrioritySchema>, viewer: AuthUser) {
    await mutate(id, body.revision, viewer, async (tx, c) => {
      if (c.priority === body.priority) return;
      // Recompute the CURRENT open SLA cycle from its start using the new priority
      // policy (prior cycles untouched — never silently rewritten).
      const cyc = await currentCycle(tx, id);
      const policy = await slaPolicyFor(tx, body.priority);
      let denorm: Prisma.ComplaintUpdateInput = { priority: body.priority, revision: { increment: 1 } };
      if (cyc && c.lifecycleStatus === "OPEN") {
        const times = computeCycleTimes(policy, cyc.startedAt);
        await tx.complaintSlaCycle.update({ where: { id: cyc.id }, data: { prioritySnapshot: body.priority, firstResponseMinutes: policy.firstResponseMinutes, resolutionMinutes: policy.resolutionMinutes, warningBeforeMinutes: policy.warningBeforeMinutes, firstResponseDueAt: times.firstResponseDueAt, resolutionDueAt: times.resolutionDueAt, warningAt: times.warningAt, firstResponseBreachedAt: null, resolutionBreachedAt: null, warningNotifiedAt: null } });
        denorm = { ...denorm, slaFirstResponseDueAt: times.firstResponseDueAt, slaResolutionDueAt: times.resolutionDueAt, slaWarnAt: times.warningAt, isLate: false };
      }
      await tx.complaint.update({ where: { id }, data: denorm });
      await addTimeline(tx, id, "PRIORITY_CHANGED", viewer.id, { from: c.priority, to: body.priority });
    });
    return detailById(id, viewer);
  }

  /** Persist a DRAFT proposed resolution (processing-form "save") without resolving
   *  — no lifecycle/stage change, revision-CAS. resolve/close still own the final one. */
  async function updateSolutionProposed(id: number, body: z.infer<typeof UpdateSolutionProposedSchema>, viewer: AuthUser) {
    await mutate(id, body.revision, viewer, async (tx, c) => {
      if ((c.solutionProposed ?? "") === body.solutionProposed) return;
      await tx.complaint.update({ where: { id }, data: { solutionProposed: body.solutionProposed, revision: { increment: 1 } } });
    });
    return detailById(id, viewer);
  }

  async function resolve(id: number, body: z.infer<typeof ResolveSchema>, viewer: AuthUser) {
    await mutate(id, body.revision, viewer, async (tx, c) => {
      if (c.lifecycleStatus !== "OPEN") throw complaintNotOpenError(c.lifecycleStatus);
      const at = now();
      await tx.complaint.update({ where: { id }, data: { lifecycleStatus: "RESOLVED", stage: "RESOLVED", waitingReason: null, waitingReasonNote: null, resolvedAt: at, resolvedByUserId: viewer.id, resolutionSummary: body.resolutionSummary, solutionProposed: body.solutionProposed ?? null, revision: { increment: 1 } } });
      const cyc = await currentCycle(tx, id);
      if (cyc && !cyc.resolvedAt) await tx.complaintSlaCycle.update({ where: { id: cyc.id }, data: { resolvedAt: at } });
      await markFirstResponse(tx, c, viewer.id);
      await addTimeline(tx, id, "RESOLVED", viewer.id);
    });
    // Notify AFTER the tx commits (best-effort; never breaks the resolve). Cycle
    // number as dedupe suffix so a resolve→reopen→resolve re-notifies per cycle.
    const c = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    await notify(EVENTS.RESOLVED, id, c, `C${c.slaCurrentCycleNumber ?? 1}`);
    return detailById(id, viewer);
  }

  async function close(id: number, body: z.infer<typeof CloseSchema>, viewer: AuthUser) {
    const result = await mutate(id, body.revision, viewer, async (tx, c) => {
      if (c.lifecycleStatus === "CLOSED") throw complaintAlreadyClosedError();
      const summary = body.resolutionSummary ?? c.resolutionSummary;
      if (!summary) throw resolutionRequiredError();
      const at = now();
      const closureNumber = c.closureCount + 1;
      await tx.complaint.update({ where: { id }, data: { lifecycleStatus: "CLOSED", stage: "CLOSED", waitingReason: null, waitingReasonNote: null, closedAt: at, closedByUserId: viewer.id, resolutionSummary: summary, resolvedAt: c.resolvedAt ?? at, closureCount: closureNumber, revision: { increment: 1 } } });
      const cyc = await currentCycle(tx, id);
      if (cyc) await tx.complaintSlaCycle.update({ where: { id: cyc.id }, data: { closedAt: at, resolvedAt: cyc.resolvedAt ?? at } });
      await addTimeline(tx, id, "CLOSED", viewer.id, { closureNumber });
      return { closureNumber };
    });
    const c = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    await notify(EVENTS.CLOSED, id, c, String(result.closureNumber));
    return detailById(id, viewer);
  }

  async function reopen(id: number, body: z.infer<typeof ReopenSchema>, viewer: AuthUser) {
    await mutate(id, body.revision, viewer, async (tx, c) => {
      if (c.lifecycleStatus !== "CLOSED" && c.lifecycleStatus !== "RESOLVED") throw reopenNotAllowedError(c.lifecycleStatus);
      const at = now();
      const nextCycle = (c.slaCurrentCycleNumber ?? 1) + 1;
      // New SLA cycle; prior cycle preserved (its closedAt stays).
      const times = await startCycle(tx, id, c.priority, nextCycle, at);
      await tx.complaint.update({
        where: { id },
        data: {
          lifecycleStatus: "OPEN", stage: REOPEN_STAGE, waitingReason: null, waitingReasonNote: null, reopenedCount: { increment: 1 }, lastReopenedAt: at,
          isLate: false, slaCurrentCycleNumber: nextCycle, slaFirstResponseDueAt: times.times.firstResponseDueAt,
          slaResolutionDueAt: times.times.resolutionDueAt, slaWarnAt: times.times.warningAt, firstRespondedAt: null, revision: { increment: 1 },
        },
      });
      await addTimeline(tx, id, "REOPENED", viewer.id, { reason: undefined, cycleNumber: nextCycle });
    });
    const c = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    await notify(EVENTS.REOPENED, id, c);
    return detailById(id, viewer);
  }

  /**
   * Where THIS case can be escalated to, with real names — the data the dialog
   * needs to tell the operator where the case will go before they confirm.
   *
   * Only departments that can actually receive the case: ACTIVE, inside the
   * caller's BRANCH scope, and belonging to the complaint's branch (or
   * branch-less/global). The complaint's current department is excluded — you
   * cannot escalate a case to where it already is. Each target carries its
   * eligible employees, and `autoAssignee` when there is exactly one, so a
   * single-owner destination is preselected and named up front.
   *
   * Two bounded queries, no N+1.
   */
  async function escalationTargets(id: number, viewer: AuthUser) {
    const c = await loadScoped(id, viewer);
    const scope = await resolveScope(viewer);
    // Deliberately SIMPLE. The only reasons a department is not offered:
    //   • it is the one the case is already with,
    //   • it is not active,
    //   • it sits in a branch this caller does not cover (a full-scope caller
    //     sees every active department).
    // There is NO "can this department receive escalations?" flag — the domain
    // has no such concept, and inventing one would mean nothing shows up until
    // somebody configures an invisible setting. An earlier version of this query
    // also required the department to belong to the CASE's own branch; that
    // returned zero for any case in a branch with no departments of its own, and
    // it contradicts how cases are actually routed here (a case in one branch is
    // routinely handled by a department registered under another).
    const departments = await prisma.department.findMany({
      where: {
        isActive: true,
        ...(c.departmentId != null ? { id: { not: c.departmentId } } : {}),
        ...(scope.allBranches ? {} : { OR: [{ branchId: { in: scope.branchIds } }, { branchId: null }] }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    const deptIds = departments.map((d) => d.id);
    // The employees offered are EXACTLY the set `isAssigneeEligible` will accept
    // at escalate time — active, a member of the department, and either in the
    // case's branch or holding cross-branch complaint access. Listing anyone
    // wider would let an operator pick a name and then be refused.
    const members = deptIds.length
      ? await prisma.user.findMany({
          where: {
            status: "ACTIVE",
            departmentAssignments: { some: { departmentId: { in: deptIds } } },
            ...(c.branchId != null
              ? { OR: [{ branchAssignments: { some: { branchId: c.branchId } } }, { roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES } } } } } } }] }
              : {}),
          },
          select: { id: true, name: true, departmentAssignments: { where: { departmentId: { in: deptIds } }, select: { departmentId: true } } },
          take: 500,
        })
      : [];
    const byDept = new Map<number, { userId: number; name: string }[]>();
    for (const u of members) {
      for (const a of u.departmentAssignments) {
        const list = byDept.get(a.departmentId) ?? [];
        // `name` is nullable on the user record; a nameless account would render
        // as an empty option, so fall back to something identifiable.
        list.push({ userId: u.id, name: u.name ?? `#${u.id}` });
        byDept.set(a.departmentId, list);
      }
    }
    const [currentDept, currentAssignee] = await Promise.all([
      c.departmentId != null ? prisma.department.findUnique({ where: { id: c.departmentId }, select: { name: true } }) : null,
      c.assignedToUserId != null ? prisma.user.findUnique({ where: { id: c.assignedToUserId }, select: { name: true } }) : null,
    ]);
    return {
      currentDepartmentId: c.departmentId,
      currentDepartmentName: currentDept?.name ?? null,
      currentAssigneeId: c.assignedToUserId,
      currentAssigneeName: currentAssignee?.name ?? null,
      targets: departments.map((d) => {
        const assignees = byDept.get(d.id) ?? [];
        return {
          departmentId: d.id,
          departmentName: d.name,
          assignees,
          autoAssignee: assignees.length === 1 ? (assignees[0] ?? null) : null,
        };
      }),
    };
  }

  /**
   * Escalate a case to an EXPLICIT destination.
   *
   * Transfer semantics (chosen because the previous behaviour transferred
   * NOTHING — it only bumped a number, so there was no existing behaviour worth
   * preserving): the target department becomes the responsible department; a
   * named target employee becomes the new assignee; an assignee who is not
   * eligible for the new department is cleared rather than silently carried
   * over. The previous owners survive in the escalation row and the timeline.
   *
   * Everything below happens in ONE transaction under the complaint's advisory
   * lock, with an optimistic revision check — so a double submit finds a bumped
   * revision and is refused, and a failure anywhere rolls the whole thing back
   * (no half-escalated case). The notification is deliberately sent AFTER the
   * transaction commits: notifying about a transfer that got rolled back would
   * be worse than not notifying at all.
   */
  async function escalate(id: number, body: z.infer<typeof EscalateSchema>, viewer: AuthUser): Promise<{ detail: Awaited<ReturnType<typeof detailById>>; outcome: EscalationOutcome }> {
    const scope = await resolveScope(viewer);
    const target = await prisma.department.findUnique({ where: { id: body.targetDepartmentId }, select: { id: true, isActive: true, branchId: true } });
    if (!target) throw escalationTargetInvalidError("department not found");
    if (!target.isActive) throw escalationTargetInvalidError("department is not active");
    // Branch scope: the caller must cover the destination's branch. Checked
    // BEFORE anything else leaks, and with a message that names nothing.
    if (!scope.allBranches && target.branchId != null && !scope.branchIds.includes(target.branchId)) {
      throw escalationTargetOutOfScopeError();
    }

    const outcome = await mutate(id, body.revision, viewer, async (tx, c): Promise<EscalationOutcome> => {
      // A closed case is finished; a resolved one is re-opened, not escalated.
      if (c.lifecycleStatus !== "OPEN") throw complaintNotOpenError(c.lifecycleStatus);
      // NOTE: there is deliberately no "destination must be in the case's own
      // branch" rule. Cases here are routinely handled by a department
      // registered under a different branch, and some branches have no
      // departments at all — such a rule makes those cases un-escalatable. The
      // branch guard that DOES apply is on the CALLER (checked above): you may
      // only escalate to a department in a branch you cover.
      let toUserId: number | null = null;
      if (body.targetAssigneeId != null) {
        const eligible = await isAssigneeEligible(body.targetAssigneeId, target.id, c.branchId);
        if (!eligible) throw assigneeNotEligibleError("assignee not eligible for the destination department/branch");
        toUserId = body.targetAssigneeId;
      } else if (c.assignedToUserId != null && (await isAssigneeEligible(c.assignedToUserId, target.id, c.branchId))) {
        // The current owner also belongs to the destination — keep them rather
        // than dropping the case into an unassigned queue.
        toUserId = c.assignedToUserId;
      }
      // Escalating to the exact same place is a no-op that would still write
      // history and fire notifications.
      if (c.departmentId === target.id && c.assignedToUserId === toUserId) throw escalationTargetSameError();

      const level = c.escalationLevel + 1;
      const at = now();
      await tx.complaint.update({
        where: { id },
        data: {
          departmentId: target.id, assignedToUserId: toUserId, routingStatus: "ROUTED",
          isEscalated: true, escalationLevel: level, escalatedAt: at, revision: { increment: 1 },
        },
      });
      const esc = await tx.complaintEscalation.create({
        data: {
          complaintId: id, level, reason: body.reason, triggerType: "MANUAL", createdByUserId: viewer.id,
          fromDepartmentId: c.departmentId, toDepartmentId: target.id,
          fromUserId: c.assignedToUserId, toUserId,
        },
        select: { id: true },
      });
      // ONE timeline entry describing the whole transfer — from/to department and
      // from/to owner — so the case history reads as a sentence, not as three
      // unrelated events.
      // The stated reason travels WITH the event. Timeline metadata otherwise
      // carries ids only; an escalation reason is the operator's justification
      // for a routing decision — the same audit-relevant text already stored on
      // the escalation row, visible to the same readers. It is NOT customer PII
      // and NOT an internal note body, so the "ids only" rule still holds for
      // everything it was written to protect.
      await addTimeline(tx, id, "ESCALATED", viewer.id, {
        trigger: "MANUAL", level, reason: body.reason,
        fromDepartmentId: c.departmentId, toDepartmentId: target.id,
        fromUserId: c.assignedToUserId, toUserId,
        escalationId: esc.id,
      });
      return {
        escalationId: esc.id, level,
        fromDepartmentId: c.departmentId, toDepartmentId: target.id,
        fromUserId: c.assignedToUserId, toUserId,
      };
    });

    const c = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    // Audience is resolved from the case AS IT NOW STANDS, so the notice reaches
    // the destination department and the new owner — not the old ones.
    await notify(EVENTS.ESCALATED, id, c, `L${c.escalationLevel}`);
    return { detail: await detailById(id, viewer), outcome };
  }

  // --- Actions ---
  async function addAction(id: number, body: z.infer<typeof CreateActionSchema>, viewer: AuthUser) {
    const c = await loadScoped(id, viewer);
    const action = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, A_LOCK, id);
      const a = await tx.complaintAction.create({ data: { complaintId: id, type: body.type, content: body.content, result: body.result ?? null, customerVisible: body.customerVisible ?? false, createdByUserId: viewer.id } });
      await addTimeline(tx, id, "ACTION_ADDED", viewer.id, { actionId: a.id, type: body.type, customerVisible: a.customerVisible });
      // A customer-visible communication counts as a first response.
      if (body.customerVisible && body.type !== "INTERNAL_NOTE") await markFirstResponse(tx, c, viewer.id);
      return a;
    });
    const fresh = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    await notify(EVENTS.ACTION_ADDED, id, fresh);
    return { id: action.id, type: action.type, content: action.content, result: action.result, customerVisible: action.customerVisible, createdByUserId: action.createdByUserId, createdAt: action.createdAt };
  }

  async function listActions(id: number, viewer: AuthUser) {
    await loadScoped(id, viewer);
    const rows = await prisma.complaintAction.findMany({ where: { complaintId: id }, orderBy: { createdAt: "desc" } });
    return rows.map((a) => ({ id: a.id, type: a.type, content: a.content, result: a.result, customerVisible: a.customerVisible, createdByUserId: a.createdByUserId, createdAt: a.createdAt }));
  }

  // --- Overview ---
  function startOfMonth(): Date {
    const d = now();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  async function overview(viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    // Every KPI below is spread with the SAME access scope as the list, so a
    // department-scoped user's dashboard counts only their own complaints (§9).
    const branch = scopeWhere(scope);
    const monthStart = startOfMonth();
    const [openCount, lateCount, closedThisMonth, escalatedCount, openedFromCallCenter, openedAutomatically] = await Promise.all([
      prisma.complaint.count({ where: { lifecycleStatus: "OPEN", ...branch } }),
      prisma.complaint.count({ where: { isLate: true, lifecycleStatus: "OPEN", ...branch } }),
      prisma.complaint.count({ where: { lifecycleStatus: "CLOSED", closedAt: { gte: monthStart }, ...branch } }),
      prisma.complaint.count({ where: { isEscalated: true, lifecycleStatus: "OPEN", ...branch } }),
      prisma.complaint.count({ where: { sourceType: "CALL_CENTER", ...branch } }),
      prisma.complaint.count({ where: { sourceType: { in: ["CALL_CENTER", "SYSTEM_ROUTING"] }, ...branch } }),
    ]);
    // Open complaints per lifecycle stage — one grouped query (never per-stage), for
    // the list stage-bar counts. Scope-filtered like every other overview metric.
    const byStageRaw = await prisma.complaint.groupBy({
      by: ["stage"],
      where: { lifecycleStatus: "OPEN", ...branch },
      _count: { _all: true },
    });
    const byStage = byStageRaw.map((r) => ({ stage: r.stage, count: r._count._all }));
    // Average closure duration (hours) over complaints closed this month.
    const closed = await prisma.complaint.findMany({ where: { lifecycleStatus: "CLOSED", closedAt: { gte: monthStart }, ...branch }, select: { openedAt: true, closedAt: true }, take: 5000 });
    const durations = closed.filter((c) => c.closedAt).map((c) => (c.closedAt!.getTime() - c.openedAt.getTime()) / 3_600_000);
    const averageClosureDurationHours = durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null;
    return { openCount, lateCount, closedThisMonth, averageClosureDurationHours, openedFromCallCenter, openedAutomatically, escalatedCount, byStage };
  }

  // --- Export ---
  function safeCell(value: unknown): string | number | boolean | null {
    if (value == null) return null;
    if (typeof value === "number" || typeof value === "boolean") return value;
    const s = String(value);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  }
  const EXPORT_HEADERS = ["Complaint", "Customer", "Category", "Branch", "Department", "Priority", "Stage", "Lifecycle", "Late", "Escalated", "Opened At", "Resolution Due"];
  async function collectExport(query: z.infer<typeof ListComplaintsQuerySchema>, scope: Scope) {
    const where = listWhere(query, scope);
    const total = await prisma.complaint.count({ where });
    if (total > EXPORT_LIMIT) throw exportTooLargeError(total, EXPORT_LIMIT);
    return prisma.complaint.findMany({ where, include: LIST_INCLUDE, orderBy: { openedAt: "desc" }, take: EXPORT_LIMIT });
  }
  function exportRow(c: ListRow): (string | number | null)[] {
    return [
      safeCell(c.publicNumber), safeCell(c.customer.name), safeCell(c.category?.nameEn ?? null), safeCell(c.branch?.name ?? null),
      safeCell(c.department?.name ?? null), safeCell(c.priority), safeCell(c.stage), safeCell(c.lifecycleStatus),
      c.isLate ? "yes" : "no", c.isEscalated ? "yes" : "no", safeCell(c.openedAt.toISOString()), safeCell(c.slaResolutionDueAt ? c.slaResolutionDueAt.toISOString() : null),
    ] as (string | number | null)[];
  }
  async function exportCsv(query: z.infer<typeof ListComplaintsQuerySchema>, viewer: AuthUser) {
    const rows = await collectExport(query, await resolveScope(viewer));
    const esc = (v: string | number | null) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [EXPORT_HEADERS.join(","), ...rows.map((r) => exportRow(r).map(esc).join(","))].join("\n");
  }
  async function exportXlsx(query: z.infer<typeof ListComplaintsQuerySchema>, viewer: AuthUser): Promise<Buffer> {
    const ExcelJS = (await import("exceljs")).default;
    const rows = await collectExport(query, await resolveScope(viewer));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Complaints");
    ws.addRow(EXPORT_HEADERS);
    for (const r of rows) ws.addRow(exportRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * A routing rule's REAL execution history. There is no parallel execution-log
   * table: a complaint carrying `routingRuleId` (+ its immutable
   * `routingSnapshot`) IS the record that the rule fired, so this reports facts
   * instead of a second, drift-prone ledger. Branch/department scoped exactly
   * like the complaint list — a rule's history never leaks cases the caller
   * could not open, so `total` is "within your scope", not a global count.
   */
  async function ruleExecutions(ruleId: number, limit: number, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const where = scoped(scope, { routingRuleId: ruleId });
    const [total, recent] = await Promise.all([
      prisma.complaint.count({ where }),
      prisma.complaint.findMany({
        where, orderBy: { openedAt: "desc" }, take: limit,
        select: { id: true, publicNumber: true, openedAt: true, departmentId: true, assignedToUserId: true, priority: true, lifecycleStatus: true },
      }),
    ]);
    return {
      total,
      lastExecutedAt: recent[0]?.openedAt ?? null,
      recent: recent.map((c) => ({
        complaintId: c.id, publicNumber: c.publicNumber, openedAt: c.openedAt,
        departmentId: c.departmentId, assignedToUserId: c.assignedToUserId,
        priority: c.priority, lifecycleStatus: c.lifecycleStatus,
      })),
    };
  }

  // --- Automation (durable-outbox consumer + SLA worker) ---

  async function autoCreateFromRoute(params: { sourceType: ComplaintSourceType; sourceId: string; customerId: number; purchaseExperienceId: number | null; branchId: number | null; route: Awaited<ReturnType<typeof routeFacts>>; unroutedFallback: boolean }) {
    if (!params.route && !params.unroutedFallback) return false;
    const route = params.route;
    // Idempotency pre-check (before the tx — re-querying an aborted tx fails).
    const prior = await prisma.complaint.findFirst({ where: { sourceType: params.sourceType, sourceId: params.sourceId }, select: { id: true } });
    if (prior) return false;
    // When the matched rule names an assignee, the complaint is created assigned
    // to them AND its department is derived from them (same rule as manual
    // create — the assignee owns the department). The rule's own departmentId is
    // the fallback for a rule that routes to a department only. An assignee who
    // is no longer active is dropped rather than blocking the auto-create.
    const ruleAssignee = route?.assignedToUserId ?? null;
    let assignedToUserId: number | null = null;
    let departmentId = route?.departmentId ?? null;
    if (ruleAssignee != null) {
      const active = await prisma.user.count({ where: { id: ruleAssignee, status: "ACTIVE" } });
      if (active > 0) {
        assignedToUserId = ruleAssignee;
        departmentId = (await departmentForAssignee(prisma, ruleAssignee)) ?? departmentId;
      }
    }
    let complaint;
    try {
      complaint = await withTransaction(prisma, (tx) => createCore(tx, {
        customerId: params.customerId, purchaseExperienceId: params.purchaseExperienceId, branchId: params.branchId,
        categoryId: route?.categoryId ?? null, departmentId, priority: route?.priority ?? "MEDIUM",
        sourceType: params.sourceType, sourceId: params.sourceId, routed: route != null, routingRuleId: route?.ruleId ?? null,
        routingSnapshot: route?.snapshot ?? null, description: null, actorUserId: null, assignedToUserId,
      }));
    } catch (err) {
      if (isUniqueViolation(err)) return false; // concurrent create — already exists
      throw err;
    }
    await notify(route ? EVENTS.ROUTED : EVENTS.CREATED, complaint.id, complaint);
    return true;
  }

  async function handleOutboxEvent(ev: { eventType: string; payload: Prisma.JsonValue }): Promise<boolean> {
    const p = (ev.payload ?? {}) as Record<string, unknown>;
    if (ev.eventType === "call_center.complaint_requested") {
      const callSessionId = Number(p.callSessionId);
      const facts: RoutingFacts = { sourceType: "CALL_CENTER", complaintRequested: true };
      const route = await routeFacts(facts);
      // Call-center complaint request is NEVER lost — no match ⇒ UNROUTED complaint for triage.
      return autoCreateFromRoute({ sourceType: "CALL_CENTER", sourceId: String(callSessionId), customerId: Number(p.customerId), purchaseExperienceId: (p.purchaseExperienceId as number | null) ?? null, branchId: (p.branchId as number | null) ?? null, route, unroutedFallback: true });
    }
    return false;
  }

  const OUTBOX_TYPES = ["call_center.complaint_requested"];
  async function consumeOutbox(): Promise<number> {
    const staleCutoff = new Date(now().getTime() - 5 * 60_000);
    await prisma.domainOutboxEvent.updateMany({ where: { status: "PROCESSING", lockedAt: { lt: staleCutoff } }, data: { status: "PENDING", lockedAt: null } });
    const config = await loadComplaintConfig(fastify);
    const due = await prisma.domainOutboxEvent.findMany({ where: { status: "PENDING", availableAt: { lte: now() }, eventType: { in: OUTBOX_TYPES } }, orderBy: { id: "asc" }, take: 100 });
    let created = 0;
    for (const ev of due) {
      const claim = await prisma.domainOutboxEvent.updateMany({ where: { id: ev.id, status: "PENDING" }, data: { status: "PROCESSING", lockedAt: now() } });
      if (claim.count === 0) continue; // another worker took it
      try {
        // Activation boundary — no silent historical mass backfill.
        if (!config.automationEnabledFrom || ev.createdAt >= config.automationEnabledFrom) {
          if (await handleOutboxEvent(ev)) created++;
        }
        await prisma.domainOutboxEvent.update({ where: { id: ev.id }, data: { status: "PROCESSED", processedAt: now(), lockedAt: null } });
      } catch (err) {
        const attempt = ev.attemptCount + 1;
        const failed = attempt >= ev.maxAttempts;
        await prisma.domainOutboxEvent.update({ where: { id: ev.id }, data: { status: failed ? "FAILED" : "PENDING", attemptCount: attempt, lockedAt: null, availableAt: new Date(now().getTime() + Math.min(60, 2 ** attempt) * 60_000), lastErrorCode: String((err as Error)?.message ?? "").slice(0, 120) } });
        fastify.log.error({ err, outboxId: ev.id }, "complaint outbox event failed");
      }
    }
    return created;
  }

  async function autoEscalate(complaintId: number, trigger: "SLA_BREACH" | "SLA_BREACH_DELAY") {
    const c = await prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!c || c.lifecycleStatus !== "OPEN") return;
    const level = c.escalationLevel + 1;
    await prisma.complaint.update({ where: { id: complaintId }, data: { isEscalated: true, escalationLevel: level, escalatedAt: now() } });
    await prisma.complaintEscalation.create({ data: { complaintId, level, reason: trigger, triggerType: trigger, createdByUserId: null } });
    await prisma.complaintTimelineEvent.create({ data: { complaintId, type: "ESCALATED", actorUserId: null, metadata: { level, trigger } } });
    await notify(EVENTS.ESCALATED, complaintId, { ...c, escalationLevel: level }, `L${level}`);
  }

  async function evaluateSla(): Promise<{ warnings: number; breaches: number }> {
    const cycles = await prisma.complaintSlaCycle.findMany({
      where: { closedAt: null, complaint: { lifecycleStatus: "OPEN" } },
      include: { complaint: { select: { id: true, publicNumber: true, assignedToUserId: true, departmentId: true, branchId: true, priority: true, escalationLevel: true } } },
      take: 500,
    });
    let warnings = 0, breaches = 0;
    const t = now();
    for (const cyc of cycles) {
      const c = cyc.complaint;
      if (!cyc.warningNotifiedAt && t >= cyc.warningAt && t < cyc.resolutionDueAt) {
        await prisma.complaintSlaCycle.update({ where: { id: cyc.id }, data: { warningNotifiedAt: t } });
        await prisma.complaintTimelineEvent.create({ data: { complaintId: c.id, type: "SLA_WARNING", actorUserId: null, metadata: { cycleNumber: cyc.cycleNumber } } });
        await notify(EVENTS.SLA_WARNING, c.id, c, `cyc${cyc.cycleNumber}`);
        warnings++;
      }
      let breached = false;
      if (!cyc.firstResponseBreachedAt && !cyc.firstRespondedAt && t > cyc.firstResponseDueAt) {
        await prisma.complaintSlaCycle.update({ where: { id: cyc.id }, data: { firstResponseBreachedAt: t } });
        await prisma.complaintTimelineEvent.create({ data: { complaintId: c.id, type: "SLA_BREACHED", actorUserId: null, metadata: { kind: "first_response", cycleNumber: cyc.cycleNumber } } });
        breached = true;
      }
      if (!cyc.resolutionBreachedAt && !cyc.resolvedAt && t > cyc.resolutionDueAt) {
        await prisma.complaintSlaCycle.update({ where: { id: cyc.id }, data: { resolutionBreachedAt: t } });
        await prisma.complaintTimelineEvent.create({ data: { complaintId: c.id, type: "SLA_BREACHED", actorUserId: null, metadata: { kind: "resolution", cycleNumber: cyc.cycleNumber } } });
        breached = true;
        await autoEscalate(c.id, "SLA_BREACH");
      }
      if (breached) { await prisma.complaint.update({ where: { id: c.id }, data: { isLate: true } }); await notify(EVENTS.SLA_BREACHED, c.id, c, `cyc${cyc.cycleNumber}`); breaches++; }
      // Delayed breach escalation.
      const policy = await prisma.complaintSlaPolicy.findUnique({ where: { priority: cyc.prioritySnapshot }, select: { breachEscalationDelayMinutes: true } });
      const delay = policy?.breachEscalationDelayMinutes ?? DEFAULT_SLA_POLICIES[cyc.prioritySnapshot].breachEscalationDelayMinutes;
      if (cyc.resolutionBreachedAt && !cyc.breachEscalatedAt && delay != null && t >= new Date(cyc.resolutionBreachedAt.getTime() + delay * 60_000)) {
        await prisma.complaintSlaCycle.update({ where: { id: cyc.id }, data: { breachEscalatedAt: t } });
        await autoEscalate(c.id, "SLA_BREACH_DELAY");
      }
    }
    return { warnings, breaches };
  }

  /** One background cycle (N-worker safe, idempotent). */
  async function runComplaintCycle() {
    const complaintsCreated = await consumeOutbox();
    const sla = await evaluateSla();
    // Drain the complaint EMAIL outbox (send via the central provider, with retry).
    const email = await complaintNotifications.processDueEmails();
    return {
      complaintsCreated, slaWarnings: sla.warnings, slaBreaches: sla.breaches,
      emailsSent: email.sent, emailsSkipped: email.skipped, emailsFailed: email.failed, emailsRetried: email.retried,
    };
  }

  return {
    list, detail, detailById, timeline, similar, overview, exportCsv, exportXlsx,
    createManual, transition, assign, reassign, changeDepartment, changePriority, updateSolutionProposed, resolve, close, reopen, escalate, escalationTargets, assigneeOptions,
    addAction, listActions, ruleExecutions,
    // automation + shared
    runComplaintCycle, consumeOutbox, evaluateSla,
    processComplaintEmails: complaintNotifications.processDueEmails,
    complaintNotifications,
    routeFacts, createCore, resolveScope, inScope, loadScoped,
    // exposed for scope/audience verification (backend authority — not a public route)
    resolveAudience, deptAudience,
  };
}
