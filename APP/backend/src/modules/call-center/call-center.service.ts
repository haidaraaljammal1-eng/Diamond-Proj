import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { CallQueueSourceType, CallCallbackReason } from "@prisma/client";
import type { z } from "zod";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { paginate, parseSort } from "src/lib/http/pagination";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { encryptSecret } from "src/lib/security/encryption";
import { PERMISSIONS } from "src/constants/permissions";
import { priorityFor, priorityRankFor } from "src/modules/call-center/priority";
import { CALL_CENTER_CONFIG, CALL_QUEUE_TERMINAL_STATUSES } from "src/modules/call-center/call-center.config";
import { defaultTelephonyProvider, type CallTelephonyProvider } from "src/modules/call-center/telephony";
import {
  branchOutOfScopeError, callAlreadyActiveError, callAlreadyCompletedError,
  callbackTimeInvalidError, callbackTimeRequiredError, callItemAlreadyClaimedError,
  callItemNotAssignedToUserError, callItemNotClaimableError, callItemNotFoundError,
  callNotFoundError, callbackNotFoundError, customerOptedOutPhoneError, exportTooLargeError,
  recordingNotAvailableError,
} from "src/modules/call-center/call-center.errors";
import type {
  CompleteCallSchema, ListAgentsQuerySchema, ListCallbacksQuerySchema, ListCallsQuerySchema,
  ListQueueQuerySchema, ManualEnqueueSchema,
} from "src/modules/call-center/call-center.schema";

const A_LOCK = "call_center_queue_item";
const TERMINAL: string[] = CALL_QUEUE_TERMINAL_STATUSES;
const UNANSWERED = new Set(["NO_ANSWER", "PHONE_OFF", "BUSY"]);
const RETRY_REASON: Record<string, CallCallbackReason> = { NO_ANSWER: "NO_ANSWER_RETRY", PHONE_OFF: "PHONE_OFF_RETRY", BUSY: "BUSY_RETRY" };
const MIN_MS = 60_000;

// Scalar sort whitelists (a raw field is never passed to Prisma; unknown falls
// back to the default). The queue default stays the computed multi-key priority
// order; only scalar columns are user-sortable.
const QUEUE_SORTABLE = ["createdAt", "dueAt"] as const;
const CALL_LOG_SORTABLE = ["startedAt", "endedAt"] as const;
const CALLBACK_SORTABLE = ["scheduledAt", "createdAt"] as const;

type Deps = { telephony?: CallTelephonyProvider; now?: () => Date };

export function createCallCenterService(fastify: FastifyInstance, deps: Deps = {}) {
  const prisma = fastify.prisma;
  const now = deps.now ?? (() => new Date());
  const telephony = deps.telephony ?? defaultTelephonyProvider();

  const includesPhone = (viewer: AuthUser) => hasPermission(viewer, PERMISSIONS.CALL_CENTER_CONTACTS_READ);

  // --- Hard branch scoping (central; frontend filters are NEVER security boundaries) ---

  type Scope = { all: boolean; branchIds: number[] };
  /** Resolve a caller's branch visibility: global (view_all_branches) or their assignments. */
  async function resolveScope(viewer: AuthUser): Promise<Scope> {
    if (hasPermission(viewer, PERMISSIONS.CALL_CENTER_VIEW_ALL_BRANCHES)) return { all: true, branchIds: [] };
    const rows = await prisma.userBranchAssignment.findMany({ where: { userId: viewer.id }, select: { branchId: true } });
    return { all: false, branchIds: rows.map((r) => r.branchId) };
  }
  function inScope(scope: Scope, branchId: number | null): boolean {
    return scope.all ? true : branchId != null && scope.branchIds.includes(branchId);
  }
  /** Prisma branchId filter for a scope ∩ an optional requested branch. `{ in: [] }`
   *  (a scoped user with a non-matching / empty scope) matches nothing — never null-branch. */
  function scopeBranchFilter(scope: Scope, requested?: number): Prisma.IntNullableFilter | undefined {
    if (scope.all) return requested != null ? { equals: requested } : undefined;
    const ids = requested != null ? scope.branchIds.filter((b) => b === requested) : scope.branchIds;
    return { in: ids };
  }
  /** Is a (target) user eligible to work a given branch? Global permission OR assignment. */
  async function userCanAccessBranch(userId: number, branchId: number | null): Promise<boolean> {
    const global = await prisma.user.count({ where: { id: userId, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.CALL_CENTER_VIEW_ALL_BRANCHES } } } } } } } });
    if (global > 0) return true;
    if (branchId == null) return false;
    return (await prisma.userBranchAssignment.count({ where: { userId, branchId } })) > 0;
  }

  // --- Projections (PII-aware, no N+1) ---

  function maskPhone(mobile: string | null): string | null {
    if (!mobile) return null;
    const digits = mobile.replace(/\D/g, "");
    return digits.length < 4 ? null : `••••${digits.slice(-4)}`;
  }
  function customerSummary(c: { id: number; name: string; mobile: string | null; type: "INDIVIDUAL" | "COMPANY" }, includePhone: boolean) {
    return { id: c.id, name: c.name, maskedPhone: maskPhone(c.mobile), phone: includePhone ? c.mobile : null, type: c.type };
  }
  function vehicleSummary(exp: { vehicle: { model: { name: string }; modelYear: number | null; vin: string | null } } | null, includeVin: boolean) {
    if (!exp) return null;
    return { model: exp.vehicle.model.name, year: exp.vehicle.modelYear, vin: includeVin ? exp.vehicle.vin : null };
  }
  const QUEUE_ORDER: Prisma.CallCenterQueueItemOrderByWithRelationInput[] = [{ priorityRank: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }];
  const QUEUE_INCLUDE = {
    customer: { select: { id: true, name: true, mobile: true, type: true } },
    branch: { select: { id: true, name: true } },
    purchaseExperience: { include: { vehicle: { include: { model: { select: { name: true } } } } } },
  } satisfies Prisma.CallCenterQueueItemInclude;

  function queueWhere(query: z.infer<typeof ListQueueQuerySchema>, scope: Scope): Prisma.CallCenterQueueItemWhereInput {
    const where: Prisma.CallCenterQueueItemWhereInput = {
      ...(query.reasonType ? { sourceType: query.reasonType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.search ? { customer: { name: { contains: query.search, mode: "insensitive" } } } : {}),
    };
    // requestedBranch ∩ allowedBranches — a query param can never widen scope.
    const bf = scopeBranchFilter(scope, query.branchId);
    if (bf) where.branchId = bf;
    if (query.dueCallbacks) { where.status = "CALLBACK_SCHEDULED"; where.dueAt = { lte: now() }; }
    return where;
  }

  type QueueRow = Prisma.CallCenterQueueItemGetPayload<{ include: typeof QUEUE_INCLUDE }>;
  function toQueueItem(r: QueueRow, includePhone: boolean) {
    return {
      id: r.id, priority: r.priority, priorityRank: r.priorityRank, sourceType: r.sourceType,
      reasonCode: r.reasonCode, reasonSummary: r.reasonSummary, status: r.status,
      customer: customerSummary(r.customer, includePhone),
      vehicle: vehicleSummary(r.purchaseExperience, false),
      branch: r.branch ? { id: r.branch.id, name: r.branch.name } : null,
      attemptCount: r.attemptCount, unansweredAttemptCount: r.unansweredAttemptCount,
      assignedToUserId: r.assignedToUserId, dueAt: r.dueAt, createdAt: r.createdAt,
    };
  }

  // --- Queue reads ---

  async function list(query: z.infer<typeof ListQueueQuerySchema>, viewer: AuthUser) {
    const where = queueWhere(query, await resolveScope(viewer));
    const includePhone = includesPhone(viewer);
    // Default = the computed multi-key priority order; an explicit whitelisted
    // `sort` overrides it with a single scalar-column order.
    let orderBy: Prisma.CallCenterQueueItemOrderByWithRelationInput | Prisma.CallCenterQueueItemOrderByWithRelationInput[] = QUEUE_ORDER;
    if (query.sort) {
      const { field, direction } = parseSort(query.sort, QUEUE_SORTABLE, { field: "createdAt", direction: "asc" });
      orderBy = { [field]: direction } as Prisma.CallCenterQueueItemOrderByWithRelationInput;
    }
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.callCenterQueueItem.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.callCenterQueueItem.findMany({ where, include: QUEUE_INCLUDE, orderBy, skip, take });
        return rows.map((r) => toQueueItem(r, includePhone));
      },
    });
  }

  async function callContext(id: number, viewer: AuthUser) {
    const item = await prisma.callCenterQueueItem.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, mobile: true, type: true } },
        branch: { select: { id: true, name: true } },
        purchaseExperience: { include: { vehicle: { include: { model: { select: { name: true } } } }, salesperson: { select: { id: true, name: true } } } },
      },
    });
    if (!item) throw callItemNotFoundError();
    if (!inScope(await resolveScope(viewer), item.branchId)) throw callItemNotFoundError();
    const includePhone = includesPhone(viewer);
    const active = await prisma.callSession.findFirst({ where: { queueItemId: id, status: "IN_PROGRESS" }, select: { id: true, startedAt: true, status: true } });
    const exp = item.purchaseExperience;
    return {
      queueItem: {
        id: item.id, sourceType: item.sourceType, reasonCode: item.reasonCode, reasonSummary: item.reasonSummary,
        priority: item.priority, status: item.status, attemptCount: item.attemptCount, unansweredAttemptCount: item.unansweredAttemptCount,
        assignedToUserId: item.assignedToUserId, dueAt: item.dueAt,
      },
      customer: customerSummary(item.customer, includePhone),
      vehicle: vehicleSummary(exp, includePhone),
      branch: item.branch ? { id: item.branch.id, name: item.branch.name } : null,
      salesperson: exp?.salesperson ? { id: exp.salesperson.id, name: exp.salesperson.name } : null,
      purchaseExperience: exp ? { id: exp.id, deliveryDate: exp.deliveryDate, purchaseDate: exp.purchaseDate } : null,
      activeCall: active ? { id: active.id, startedAt: active.startedAt, status: active.status } : null,
    };
  }

  // --- Agent lookup (contextual, branch-scoped, email-free) ---

  /**
   * Active users eligible to work the viewer's scoped branches — the source for
   * the reassign-agent picker and the call-log agent filter. Reuses the same
   * branch-scope resolver as every other read: a `branchId` param can only NARROW
   * within scope, never widen it. Projects id + name + primary branch only (never
   * email / roles / permissions).
   */
  async function listAgents(viewer: AuthUser, query: z.infer<typeof ListAgentsQuerySchema>) {
    const scope = await resolveScope(viewer);
    // A requested branch outside a scoped viewer's branches yields nothing.
    if (query.branchId != null && !scope.all && !scope.branchIds.includes(query.branchId)) return { items: [] };

    const branchWhere: Prisma.UserWhereInput =
      query.branchId != null
        ? { branchAssignments: { some: { branchId: query.branchId } } }
        : scope.all
          ? {}
          : { branchAssignments: { some: { branchId: { in: scope.branchIds } } } };

    const users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
        ...branchWhere,
      },
      orderBy: { name: "asc" },
      take: query.limit ?? 20,
      select: {
        id: true,
        name: true,
        // Primary branch name for "Name — Branch" display: the requested branch
        // when narrowed, else the user's first assignment (null if unassigned).
        branchAssignments: query.branchId != null
          ? { where: { branchId: query.branchId }, take: 1, select: { branch: { select: { name: true } } } }
          : { take: 1, orderBy: { id: "asc" }, select: { branch: { select: { name: true } } } },
      },
    });

    return {
      items: users.map((u) => ({
        id: u.id,
        label: u.name ?? "",
        branchName: u.branchAssignments[0]?.branch.name ?? null,
      })),
    };
  }

  // --- Manual enqueue ---

  async function enqueueManual(input: z.infer<typeof ManualEnqueueSchema>, viewer: AuthUser) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
    if (!customer) throw callItemNotFoundError();
    // Materialize a concrete branch (explicit branchId, else the experience's branch).
    let branchId = input.branchId ?? null;
    if (branchId == null && input.purchaseExperienceId) {
      const exp = await prisma.purchaseExperience.findUnique({ where: { id: input.purchaseExperienceId }, select: { branchId: true } });
      branchId = exp?.branchId ?? null;
    }
    // A branch-scoped user may only enqueue into a branch within scope (never arbitrary).
    const scope = await resolveScope(viewer);
    if (!scope.all && (branchId == null || !scope.branchIds.includes(branchId))) throw branchOutOfScopeError();

    const sourceType: CallQueueSourceType = input.sourceType ?? "MANUAL";
    // No duplicate active manual item for the same customer + reason.
    const reasonCode = input.reasonCode ?? "manual";
    const dedupeKey = `MANUAL:${input.customerId}:${sourceType}:${reasonCode}`;
    const existing = await prisma.callCenterQueueItem.findFirst({
      where: { customerId: input.customerId, sourceType, reasonCode, status: { notIn: TERMINAL as never } },
      select: { id: true },
    });
    if (existing) return getRaw(existing.id);
    try {
      const created = await prisma.callCenterQueueItem.create({
        data: {
          customerId: input.customerId, purchaseExperienceId: input.purchaseExperienceId ?? null, branchId,
          sourceType, reasonCode,
          reasonSummary: input.reasonSummary ?? null, priority: priorityFor(sourceType, input.priority),
          priorityRank: priorityRankFor(sourceType, input.priority), status: "NEW",
          dedupeKey: `${dedupeKey}:${now().getTime()}`,
        },
        select: { id: true },
      });
      return getRaw(created.id);
    } catch (err) {
      if (isUniqueViolation(err)) { const e = await prisma.callCenterQueueItem.findFirst({ where: { customerId: input.customerId, sourceType, reasonCode }, select: { id: true } }); if (e) return getRaw(e.id); }
      throw err;
    }
  }

  async function getRaw(id: number) {
    const r = await prisma.callCenterQueueItem.findUniqueOrThrow({ where: { id }, include: QUEUE_INCLUDE });
    return toQueueItem(r, false);
  }

  // --- Claiming ---

  /**
   * Phone-contact consent gate. `Customer.optOutPhone` is a withdrawal of consent
   * to be CALLED, so it is enforced on the working path (claim / start call), not
   * merely hidden in the UI — a hidden row is still claimable by id. Throws the
   * structured `customer_opted_out_phone` conflict; callers branch on the reason.
   */
  async function assertPhoneContactAllowed(customerId: number): Promise<void> {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { optOutPhone: true } });
    if (c?.optOutPhone) throw customerOptedOutPhoneError();
  }

  /** Atomic "start next call": pick the top eligible item with SKIP LOCKED so two
   *  concurrent agents can never claim the same row. */
  async function claimNext(userId: number, branchId: number | undefined, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    // Branch scope is applied INSIDE the atomic selection — never "pick global top,
    // then check scope after". A Riyadh agent can never lock a Jeddah item.
    const allowed = scope.all
      ? branchId != null ? [branchId] : null // null = no branch restriction
      : branchId != null ? scope.branchIds.filter((b) => b === branchId) : scope.branchIds;
    if (allowed != null && allowed.length === 0) return null; // scoped user, no eligible branch

    const claimedId = await withTransaction(prisma, async (tx) => {
      const params: unknown[] = [now()];
      let branchClause = "";
      if (allowed != null) { params.push(allowed); branchClause = `AND "branchId" = ANY($2::int[])`; }
      // Phone-contact consent is filtered INSIDE the atomic selection (same as
      // branch scope), so an opted-out customer is never handed to an agent and
      // never blocks the queue. A correlated NOT EXISTS is its own query level, so
      // FOR UPDATE still locks ONLY call_center_queue_items and the ORDER BY /
      // SKIP LOCKED semantics are unchanged.
      const rows = await tx.$queryRawUnsafe<{ id: number }[]>(
        `SELECT id FROM call_center_queue_items
         WHERE (status = 'NEW' OR (status = 'CALLBACK_SCHEDULED' AND "dueAt" IS NOT NULL AND "dueAt" <= $1))
         AND NOT EXISTS (
           SELECT 1 FROM customers c
           WHERE c.id = call_center_queue_items."customerId" AND c."optOutPhone" = TRUE
         )
         ${branchClause}
         ORDER BY "priorityRank" ASC, "dueAt" ASC NULLS LAST, "createdAt" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        ...params,
      );
      const id = rows[0]?.id;
      if (id == null) return null;
      await tx.callCenterQueueItem.update({ where: { id }, data: { status: "CLAIMED", assignedToUserId: userId, claimedAt: now() } });
      return id;
    });
    if (claimedId == null) return null;
    return callContext(claimedId, viewer);
  }

  /** Manual claim of a specific item. Conflicts if held by another active agent. */
  async function claimItem(id: number, userId: number, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, A_LOCK, id);
      const item = await tx.callCenterQueueItem.findUnique({ where: { id } });
      if (!item) throw callItemNotFoundError();
      if (!inScope(scope, item.branchId)) throw callItemNotFoundError();
      if (TERMINAL.includes(item.status)) throw callItemNotClaimableError(item.status);
      // Consent gate: claiming a specific item by id must not bypass optOutPhone.
      await assertPhoneContactAllowed(item.customerId);
      if (item.assignedToUserId != null && item.assignedToUserId !== userId && (item.status === "CLAIMED" || item.status === "IN_PROGRESS")) {
        throw callItemAlreadyClaimedError(item.assignedToUserId);
      }
      await tx.callCenterQueueItem.update({ where: { id }, data: { status: "CLAIMED", assignedToUserId: userId, claimedAt: now() } });
    });
    return callContext(id, viewer);
  }

  async function reassign(id: number, assignToUserId: number, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const item0 = await prisma.callCenterQueueItem.findUnique({ where: { id }, select: { branchId: true } });
    if (!item0) throw callItemNotFoundError();
    if (!inScope(scope, item0.branchId)) throw callItemNotFoundError();
    // The target agent must be eligible for the item's branch (assignment or global).
    if (!(await userCanAccessBranch(assignToUserId, item0.branchId))) throw branchOutOfScopeError();
    await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, A_LOCK, id);
      const item = await tx.callCenterQueueItem.findUnique({ where: { id } });
      if (!item) throw callItemNotFoundError();
      if (TERMINAL.includes(item.status)) throw callItemNotClaimableError(item.status);
      const status = item.status === "NEW" || item.status === "CALLBACK_SCHEDULED" ? "CLAIMED" : item.status;
      await tx.callCenterQueueItem.update({ where: { id }, data: { assignedToUserId: assignToUserId, status, claimedAt: now() } });
    });
    return callContext(id, viewer);
  }

  /** Release/abandon a claimed item back to the queue (no attempt counted). */
  async function release(id: number, userId: number, canReassign: boolean, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, A_LOCK, id);
      const item = await tx.callCenterQueueItem.findUnique({ where: { id } });
      if (!item) throw callItemNotFoundError();
      if (!inScope(scope, item.branchId)) throw callItemNotFoundError();
      if (item.assignedToUserId != null && item.assignedToUserId !== userId && !canReassign) throw callItemNotAssignedToUserError();
      // Abandon any open session for this item (never bump attemptCount here).
      await tx.callSession.updateMany({ where: { queueItemId: id, status: "IN_PROGRESS" }, data: { status: "ABANDONED", endedAt: now() } });
      const backTo = item.dueAt && item.status === "CALLBACK_SCHEDULED" ? "CALLBACK_SCHEDULED" : "NEW";
      await tx.callCenterQueueItem.update({ where: { id }, data: { status: backTo, assignedToUserId: null, claimedAt: null } });
    });
    return { released: true as const };
  }

  // --- Call lifecycle ---

  async function startCall(queueItemId: number, userId: number, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, A_LOCK, queueItemId);
      const item = await tx.callCenterQueueItem.findUnique({ where: { id: queueItemId } });
      if (!item) throw callItemNotFoundError();
      if (!inScope(scope, item.branchId)) throw callItemNotFoundError();
      if (TERMINAL.includes(item.status)) throw callItemNotClaimableError(item.status);
      if (item.assignedToUserId !== userId) throw callItemNotAssignedToUserError();
      // Re-check consent at dial time: the customer may have opted out AFTER the
      // item was claimed. No call session is opened for an opted-out customer.
      await assertPhoneContactAllowed(item.customerId);
      const active = await tx.callSession.findFirst({ where: { queueItemId, status: "IN_PROGRESS" } });
      if (active) throw callAlreadyActiveError(active.id);


      const mode = telephony.readiness() === "CONFIGURED" ? "PROVIDER" : "MANUAL";
      const session = await tx.callSession.create({
        data: { queueItemId, agentUserId: userId, startedAt: now(), mode, status: "IN_PROGRESS", recordingStatus: "UNAVAILABLE" },
      });
      await tx.callCenterQueueItem.update({ where: { id: queueItemId }, data: { status: "IN_PROGRESS" } });
      return toSession(session);
    });
  }

  function toSession(s: { id: number; queueItemId: number; agentUserId: number; startedAt: Date; endedAt: Date | null; durationSeconds: number | null; mode: "MANUAL" | "PROVIDER"; status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "ABANDONED"; outcome: string | null; recordingStatus: "PENDING" | "AVAILABLE" | "FAILED" | "UNAVAILABLE"; wantsFurtherContact: boolean | null; complaintRequested: boolean }) {
    return {
      id: s.id, queueItemId: s.queueItemId, agentUserId: s.agentUserId, startedAt: s.startedAt, endedAt: s.endedAt,
      durationSeconds: s.durationSeconds, mode: s.mode, status: s.status, outcome: s.outcome as never,
      recordingStatus: s.recordingStatus, wantsFurtherContact: s.wantsFurtherContact, complaintRequested: s.complaintRequested,
    };
  }

  async function completeCall(callId: number, body: z.infer<typeof CompleteCallSchema>, userId: number, viewer: AuthUser) {
    // Outcome-specific callback-time validation before the transaction.
    if (body.outcome === "CALLBACK_REQUESTED") {
      if (!body.callbackAt) throw callbackTimeRequiredError();
      if (body.callbackAt.getTime() <= now().getTime()) throw callbackTimeInvalidError();
    }
    if (body.callbackAt && body.callbackAt.getTime() <= now().getTime()) throw callbackTimeInvalidError();
    const scope = await resolveScope(viewer);

    const result = await withTransaction(prisma, async (tx) => {
      const session = await tx.callSession.findUnique({ where: { id: callId }, include: { queueItem: true } });
      if (!session) throw callNotFoundError();
      if (!inScope(scope, session.queueItem.branchId)) throw callNotFoundError();
      if (session.agentUserId !== userId) throw callItemNotAssignedToUserError();
      if (session.status !== "IN_PROGRESS") throw callAlreadyCompletedError();
      await acquireAdvisoryLock(tx, A_LOCK, session.queueItemId);

      const durationSeconds = Math.max(0, Math.round((now().getTime() - session.startedAt.getTime()) / 1000));
      const item = session.queueItem;

      let queueStatus: string = item.status;
      let callbackScheduled = false;
      let unreachable = false;
      const incUnanswered = UNANSWERED.has(body.outcome) ? 1 : 0;
      const newUnanswered = item.unansweredAttemptCount + incUnanswered;

      if (body.outcome === "CALL_COMPLETED" || body.outcome === "FOLLOW_UP_COMPLETED") {
        queueStatus = "COMPLETED";
      } else if (UNANSWERED.has(body.outcome)) {
        if (newUnanswered >= CALL_CENTER_CONFIG.maxUnansweredAttempts) {
          queueStatus = "UNREACHABLE";
          unreachable = true;
        } else {
          const at = body.callbackAt ?? new Date(now().getTime() + CALL_CENTER_CONFIG.defaultRetryDelayMinutes * MIN_MS);
          await tx.callCallback.create({ data: { queueItemId: item.id, callSessionId: session.id, scheduledAt: at, timezone: body.callbackTimezone ?? "UTC", reason: RETRY_REASON[body.outcome]!, status: "SCHEDULED" } });
          queueStatus = "CALLBACK_SCHEDULED";
          callbackScheduled = true;
        }
      } else if (body.outcome === "WRONG_NUMBER") {
        queueStatus = "INVALID_CONTACT";
      } else if (body.outcome === "CALLBACK_REQUESTED") {
        await tx.callCallback.create({ data: { queueItemId: item.id, callSessionId: session.id, scheduledAt: body.callbackAt!, timezone: body.callbackTimezone ?? "UTC", reason: "CUSTOMER_REQUESTED", status: "SCHEDULED" } });
        queueStatus = "CALLBACK_SCHEDULED";
        callbackScheduled = true;
      } else if (body.outcome === "REFUSED_PARTICIPATION") {
        queueStatus = "REFUSED";
      }

      // wantsFurtherContact with an explicit time (but non-callback outcome) → schedule.
      if (!callbackScheduled && body.wantsFurtherContact && body.callbackAt) {
        await tx.callCallback.create({ data: { queueItemId: item.id, callSessionId: session.id, scheduledAt: body.callbackAt, timezone: body.callbackTimezone ?? "UTC", reason: "CUSTOMER_REQUESTED", status: "SCHEDULED" } });
        queueStatus = queueStatus === item.status ? "CALLBACK_SCHEDULED" : queueStatus;
        callbackScheduled = true;
      }

      // A complaint opened from this call takes over — the call-center follow-up
      // itself is done (closing the complaint is a separate, independent flow).
      // Reuses COMPLETED (no new enum value) so it disappears from the active
      // queue exactly like any other resolved outcome.
      if (body.complaintRequested) {
        queueStatus = "COMPLETED";
      }

      const updated = await tx.callSession.update({
        where: { id: callId },
        data: {
          status: "COMPLETED", outcome: body.outcome, endedAt: now(), durationSeconds,
          wantsFurtherContact: body.wantsFurtherContact ?? null, internalNote: body.internalNote ?? null,
          complaintRequested: body.complaintRequested ?? false,
        },
      });
      await tx.callCenterQueueItem.update({
        where: { id: item.id },
        data: {
          status: queueStatus as never,
          attemptCount: { increment: 1 },
          unansweredAttemptCount: incUnanswered ? { increment: 1 } : undefined,
          dueAt: callbackScheduled ? (body.callbackAt ?? new Date(now().getTime() + CALL_CENTER_CONFIG.defaultRetryDelayMinutes * MIN_MS)) : item.dueAt,
          wantsFurtherContact: body.wantsFurtherContact ?? item.wantsFurtherContact,
          complaintRequested: body.complaintRequested ?? item.complaintRequested,
        },
      });

      // Durable outbox event (transactional) — BE-4 complaint worker consumes this,
      // so a complaint request is never lost on crash. IDs only (+ reason codes).
      if (body.complaintRequested) {
        await writeOutboxEvent(tx, {
          eventType: "call_center.complaint_requested",
          aggregateType: "call_session",
          aggregateId: String(session.id),
          dedupeKey: `call_center.complaint_requested:${session.id}`,
          payload: {
            callSessionId: session.id, queueItemId: item.id, customerId: item.customerId,
            branchId: item.branchId,
            complaintRequestReasonCodes: body.complaintRequestReasonCodes ?? [],
          },
        });
      }
      return { session: updated, item, queueStatus, callbackScheduled, unreachable, complaintRequested: body.complaintRequested ?? false };
    });

    // Post-commit, non-blocking side effects (never fail the completion).
    if (result.unreachable) {
      emitDomainEvent("call_center.customer_unreachable", { queueItemId: result.item.id, branchId: result.item.branchId, customerId: result.item.customerId });
      await notifyUnreachable(result.item).catch((err) => fastify.log.error({ err }, "unreachable notification failed"));
    }
    if (result.session.outcome === "WRONG_NUMBER") {
      emitDomainEvent("customer.contact_issue_reported", { queueItemId: result.item.id, customerId: result.item.customerId, callSessionId: result.session.id });
    }
    // complaint_requested is now a durable outbox event (written in-tx above),
    // not a log — so it survives a crash and is consumed idempotently by BE-4.

    return {
      callSession: toSession(result.session),
      queueStatus: result.queueStatus as never,
      callbackScheduled: result.callbackScheduled,
      unreachable: result.unreachable,
    };
  }

  function emitDomainEvent(event: string, meta: Record<string, unknown>) {
    // Safe metadata only (ids) — never notes/PII/answer text. Consumed by BE-4 later.
    fastify.log.info({ event, ...meta }, "call center domain event");
  }

  async function notifyUnreachable(item: { id: number; branchId: number | null; customerId: number }) {
    if (!item.branchId) return;
    const b = await prisma.branch.findUnique({ where: { id: item.branchId }, select: { managerUserId: true } });
    if (!b?.managerUserId) return;
    const mgr = await prisma.user.findUnique({ where: { id: b.managerUserId }, select: { status: true } });
    if (!mgr || mgr.status !== "ACTIVE") return;
    const dedupeKey = `call_center.customer_unreachable:${item.id}`;
    const existing = await prisma.notification.findFirst({ where: { userId: b.managerUserId, eventKey: "call_center.customer_unreachable", data: { path: ["dedupeKey"], equals: dedupeKey } } });
    if (existing) return;
    await prisma.notification.create({
      data: { userId: b.managerUserId, eventKey: "call_center.customer_unreachable", title: "Customer unreachable", body: "A customer could not be reached after multiple attempts.", data: { queueItemId: item.id, branchId: item.branchId, customerId: item.customerId, dedupeKey } },
    });
  }

  // --- Callbacks ---

  async function listCallbacks(query: z.infer<typeof ListCallbacksQuerySchema>, viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const bf = scopeBranchFilter(scope, query.branchId);
    const where: Prisma.CallCallbackWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(bf ? { queueItem: { branchId: bf } } : {}),
      ...(query.agentUserId ? { callSession: { agentUserId: query.agentUserId } } : {}),
      ...(query.dueOnly ? { status: { in: ["SCHEDULED", "DUE"] }, scheduledAt: { lte: now() } } : {}),
    };
    const includePhone = includesPhone(viewer);
    const { field, direction } = parseSort(query.sort, CALLBACK_SORTABLE, { field: "scheduledAt", direction: "asc" });
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.callCallback.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.callCallback.findMany({
          where, orderBy: { [field]: direction } as Prisma.CallCallbackOrderByWithRelationInput, skip, take,
          include: { queueItem: { include: { customer: { select: { id: true, name: true, mobile: true, type: true } }, branch: { select: { id: true, name: true } } } } },
        });
        return rows.map((cb) => ({
          id: cb.id, queueItemId: cb.queueItemId, scheduledAt: cb.scheduledAt, timezone: cb.timezone, reason: cb.reason, status: cb.status,
          previousAttempts: cb.queueItem.attemptCount,
          customer: customerSummary(cb.queueItem.customer, includePhone),
          branch: cb.queueItem.branch ? { id: cb.queueItem.branch.id, name: cb.queueItem.branch.name } : null,
        }));
      },
    });
  }

  async function cancelCallback(id: number, viewer: AuthUser) {
    const cb = await prisma.callCallback.findUnique({ where: { id }, select: { id: true, queueItemId: true, status: true, queueItem: { select: { branchId: true } } } });
    if (!cb) throw callbackNotFoundError();
    if (!inScope(await resolveScope(viewer), cb.queueItem.branchId)) throw callbackNotFoundError();
    await withTransaction(prisma, async (tx) => {
      await tx.callCallback.update({ where: { id }, data: { status: "CANCELLED" } });
      // If no other pending callback remains, return the item to NEW.
      const remaining = await tx.callCallback.count({ where: { queueItemId: cb.queueItemId, status: { in: ["SCHEDULED", "DUE"] } } });
      if (remaining === 0) {
        const item = await tx.callCenterQueueItem.findUnique({ where: { id: cb.queueItemId }, select: { status: true } });
        if (item?.status === "CALLBACK_SCHEDULED") await tx.callCenterQueueItem.update({ where: { id: cb.queueItemId }, data: { status: "NEW", dueAt: null } });
      }
    });
    return { cancelled: true as const };
  }

  // --- Call log ---

  function callWhere(query: z.infer<typeof ListCallsQuerySchema>, scope: Scope): Prisma.CallSessionWhereInput {
    const bf = scopeBranchFilter(scope, query.branchId);
    return {
      ...(query.agentUserId ? { agentUserId: query.agentUserId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(bf ? { queueItem: { branchId: bf } } : {}),
      ...(query.complaintRequested !== undefined ? { complaintRequested: query.complaintRequested } : {}),
      ...(query.hasRecording !== undefined ? (query.hasRecording ? { recordingStatus: "AVAILABLE" } : { recordingStatus: { not: "AVAILABLE" } }) : {}),
      ...(query.startedFrom || query.startedTo ? { startedAt: { ...(query.startedFrom ? { gte: query.startedFrom } : {}), ...(query.startedTo ? { lte: query.startedTo } : {}) } } : {}),
    };
  }

  const CALL_INCLUDE = {
    // Agent summary joined in the SAME query (no per-row user lookup / N+1).
    agent: { select: { id: true, name: true } },
    queueItem: {
      include: {
        customer: { select: { id: true, name: true, mobile: true, type: true } },
        branch: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.CallSessionInclude;
  type CallRow = Prisma.CallSessionGetPayload<{ include: typeof CALL_INCLUDE }>;

  function toCallLogItem(s: CallRow, includePhone: boolean) {
    return {
      id: s.id, queueItemId: s.queueItemId, startedAt: s.startedAt, endedAt: s.endedAt, durationSeconds: s.durationSeconds,
      agentUserId: s.agentUserId,
      agent: s.agent ? { id: s.agent.id, displayName: s.agent.name ?? `User #${s.agent.id}` } : null,
      outcome: s.outcome, status: s.status, recordingStatus: s.recordingStatus, complaintRequested: s.complaintRequested,
      customer: customerSummary(s.queueItem.customer, includePhone),
      branch: s.queueItem.branch ? { id: s.queueItem.branch.id, name: s.queueItem.branch.name } : null,
    };
  }

  async function listCalls(query: z.infer<typeof ListCallsQuerySchema>, viewer: AuthUser) {
    const where = callWhere(query, await resolveScope(viewer));
    const includePhone = includesPhone(viewer);
    const { field, direction } = parseSort(query.sort, CALL_LOG_SORTABLE, { field: "startedAt", direction: "desc" });
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.callSession.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.callSession.findMany({ where, include: CALL_INCLUDE, orderBy: { [field]: direction } as Prisma.CallSessionOrderByWithRelationInput, skip, take });
        return rows.map((r) => toCallLogItem(r, includePhone));
      },
    });
  }

  async function callDetail(id: number, viewer: AuthUser) {
    const s = await prisma.callSession.findUnique({
      where: { id },
      include: {
        // Same agent summary as the list (shared toCallLogItem mapper); one query.
        agent: { select: { id: true, name: true } },
        queueItem: {
          include: {
            customer: { select: { id: true, name: true, mobile: true, type: true } },
            branch: { select: { id: true, name: true } },
            purchaseExperience: { include: { vehicle: { include: { model: { select: { name: true } } } } } },
          },
        },
      },
    });
    if (!s) throw callNotFoundError();
    if (!inScope(await resolveScope(viewer), s.queueItem.branchId)) throw callNotFoundError();
    const includePhone = includesPhone(viewer);
    const base = toCallLogItem({ ...s, queueItem: { ...s.queueItem } } as CallRow, includePhone);
    return {
      ...base,
      mode: s.mode,
      wantsFurtherContact: s.wantsFurtherContact,
      internalNote: s.internalNote,
      sourceType: s.queueItem.sourceType,
      vehicle: vehicleSummary(s.queueItem.purchaseExperience, includePhone),
    };
  }

  // --- Recording access (short-lived signed token; audited by the route) ---

  async function recordingAccess(callId: number, viewer: AuthUser) {
    // Permission is enforced by the route; branch scope is enforced here too — a
    // recordings.read holder from another branch still cannot reach the recording.
    const session = await prisma.callSession.findUnique({ where: { id: callId }, select: { queueItem: { select: { branchId: true } } } });
    if (!session) throw callNotFoundError();
    if (!inScope(await resolveScope(viewer), session.queueItem.branchId)) throw callNotFoundError();
    const rec = await prisma.callRecording.findUnique({ where: { callSessionId: callId }, select: { id: true, status: true } });
    if (!rec || rec.status !== "AVAILABLE") throw recordingNotAvailableError(rec?.status ?? "UNAVAILABLE");
    // Self-contained, tamper-proof, short-lived token (AES-256-GCM) — no permanent
    // URL stored, no plaintext id in the link. A stream endpoint decrypts + checks exp.
    const expiresAt = new Date(now().getTime() + CALL_CENTER_CONFIG.recordingAccessTtlSeconds * 1000);
    const token = encryptSecret(JSON.stringify({ rid: rec.id, sid: callId, exp: expiresAt.getTime() }));
    return {
      callSessionId: callId,
      status: rec.status,
      url: `/call-center/recordings/stream?token=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }

  // --- Overview / KPIs ---

  function startOfToday(): Date {
    const d = now();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  async function overview(viewer: AuthUser) {
    const scope = await resolveScope(viewer);
    const bf = scopeBranchFilter(scope);
    const qBranch: Prisma.CallCenterQueueItemWhereInput = bf ? { branchId: bf } : {};
    const sBranch: Prisma.CallSessionWhereInput = bf ? { queueItem: { branchId: bf } } : {};
    const today = startOfToday();
    const [callsToday, pendingQueue, unreachableCount, complaintRequests, durAgg, callbacksDue] = await Promise.all([
      prisma.callSession.count({ where: { startedAt: { gte: today }, ...sBranch } }),
      prisma.callCenterQueueItem.count({ where: { status: { in: ["NEW", "CALLBACK_SCHEDULED"] }, ...qBranch } }),
      prisma.callCenterQueueItem.count({ where: { status: "UNREACHABLE", ...qBranch } }),
      prisma.callSession.count({ where: { complaintRequested: true, ...sBranch } }),
      prisma.callSession.aggregate({ _avg: { durationSeconds: true }, where: { durationSeconds: { not: null }, ...sBranch } }),
      prisma.callCallback.count({ where: { status: { in: ["SCHEDULED", "DUE"] }, scheduledAt: { lte: now() }, ...(bf ? { queueItem: { branchId: bf } } : {}) } }),
    ]);

    // Distinct customers reached (completed call) today — bounded by today's volume.
    const completedToday = await prisma.callSession.findMany({ where: { status: "COMPLETED", endedAt: { gte: today }, ...sBranch }, select: { queueItem: { select: { customerId: true } } } });
    const followedUp = new Set(completedToday.map((c) => c.queueItem.customerId)).size;


    return {
      callsToday,
      customersFollowedUpToday: followedUp,
      pendingQueue,
      dueCallbacks: callbacksDue,
      unreachableCount,
      complaintRequests,
      averageCallDurationSeconds: durAgg._avg.durationSeconds ?? null,
    };
  }

  // --- Export (XLSX / CSV) ---

  function safeCell(value: unknown): string | number | boolean | null {
    if (value == null) return null;
    if (typeof value === "number" || typeof value === "boolean") return value;
    const s = String(value);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  }

  async function collectExport(query: z.infer<typeof ListQueueQuerySchema>, scope: Scope) {
    const where = queueWhere(query, scope);
    const total = await prisma.callCenterQueueItem.count({ where });
    if (total > CALL_CENTER_CONFIG.exportLimit) throw exportTooLargeError(total, CALL_CENTER_CONFIG.exportLimit);
    return prisma.callCenterQueueItem.findMany({ where, include: QUEUE_INCLUDE, orderBy: QUEUE_ORDER, take: CALL_CENTER_CONFIG.exportLimit });
  }

  const EXPORT_HEADERS = ["Priority", "Customer", "Phone", "Vehicle", "Branch", "Reason", "Attempts", "Status", "Callback At"];
  function exportRow(r: QueueRow, includePhone: boolean): (string | number | null)[] {
    const veh = vehicleSummary(r.purchaseExperience, false);
    return [
      safeCell(r.priority), safeCell(r.customer.name), includePhone ? safeCell(r.customer.mobile) : safeCell(maskPhone(r.customer.mobile)),
      safeCell(veh ? `${veh.model ?? ""}${veh.year ? ` ${veh.year}` : ""}`.trim() : null),
      safeCell(r.branch?.name ?? null), safeCell(r.reasonSummary ?? r.reasonCode ?? r.sourceType),
      r.attemptCount, safeCell(r.status), safeCell(r.dueAt ? r.dueAt.toISOString() : null),
    ] as (string | number | null)[];
  }

  async function exportCsv(query: z.infer<typeof ListQueueQuerySchema>, viewer: AuthUser) {
    const rows = await collectExport(query, await resolveScope(viewer));
    const includePhone = includesPhone(viewer);
    const esc = (v: string | number | null) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [EXPORT_HEADERS.join(",")];
    for (const r of rows) lines.push(exportRow(r, includePhone).map(esc).join(","));
    return lines.join("\n");
  }

  async function exportXlsx(query: z.infer<typeof ListQueueQuerySchema>, viewer: AuthUser): Promise<Buffer> {
    const ExcelJS = (await import("exceljs")).default;
    const rows = await collectExport(query, await resolveScope(viewer));
    const includePhone = includesPhone(viewer);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Call Queue");
    ws.addRow(EXPORT_HEADERS);
    for (const r of rows) ws.addRow(exportRow(r, includePhone));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // --- Worker automation (shared background runner) ---

  /** Promote callbacks whose time has arrived to DUE (queue eligibility already
   *  derives from dueAt, so this only maintains the display status). Idempotent. */
  async function promoteDueCallbacks(): Promise<number> {
    const res = await prisma.callCallback.updateMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now() } }, data: { status: "DUE" } });
    return res.count;
  }

  /** One background cycle for call-center automation (idempotent, N-worker safe). */
  async function runCallCenterCycle() {
    const callbacksPromoted = await promoteDueCallbacks();
    return { callbacksPromoted };
  }

  return {
    list, listAgents, callContext, enqueueManual, claimNext, claimItem, reassign, release,
    startCall, completeCall,
    listCallbacks, cancelCallback, listCalls, callDetail, recordingAccess, overview,
    exportCsv, exportXlsx,
    promoteDueCallbacks, runCallCenterCycle,
  };
}
