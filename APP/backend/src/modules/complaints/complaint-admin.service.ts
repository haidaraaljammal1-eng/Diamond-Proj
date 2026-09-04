import type { FastifyInstance } from "fastify";
import type { ComplaintPriority, ComplaintSourceType, RoutingFactType, RoutingRuleOperator } from "@prisma/client";
import type { z } from "zod";
import { createRoutingEngine } from "src/modules/complaints/routing-engine";
import { ruleConditionKey, validateRuleCondition } from "src/modules/complaints/routing";
import { DEFAULT_SLA_POLICIES } from "src/modules/complaints/sla";
import {
  categoryNotFoundError, routingRuleDepartmentInvalidError, routingRuleDuplicateError,
  routingRuleInvalidConditionError, routingRuleNotFoundError, routingRuleStaleError,
  slaPolicyNotFoundError, slaPolicyStaleError,
} from "src/modules/complaints/complaints.errors";
import type { CreateRoutingRuleSchema, UpdateRoutingRuleSchema, RoutingPreviewSchema, UpdateSlaPolicySchema } from "src/modules/complaints/complaints.schema";

export function createComplaintAdminService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const engine = createRoutingEngine(prisma);

  function toRule<T extends object>(r: T): T { return r; }

  // --- Categories ---
  async function listCategories() {
    const rows = await prisma.complaintCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    return rows.map((c) => ({ id: c.id, code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, defaultDepartmentId: c.defaultDepartmentId, defaultPriority: c.defaultPriority, active: c.active, sortOrder: c.sortOrder }));
  }

  // --- Routing rules ---
  async function listRules() {
    // Same order the ENGINE evaluates in (sortOrder → createdAt → id), so the
    // list a user reads top-to-bottom is exactly the order rules actually fire.
    const rows = await prisma.complaintRoutingRule.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toRule);
  }
  async function getRule(id: number) {
    const r = await prisma.complaintRoutingRule.findUnique({ where: { id } });
    if (!r) throw routingRuleNotFoundError();
    return toRule(r);
  }
  async function assertCategory(categoryId: number) {
    const c = await prisma.complaintCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!c) throw categoryNotFoundError();
  }
  /** A rule's suggested assignee must be a real, active user. Full branch/
   *  department eligibility is enforced later, when a complaint is actually
   *  created/assigned (the backend is the authority there) — a rule may legitimately
   *  name someone who is only eligible for some of the branches it can route. */
  async function assertAssignee(userId: number | null | undefined) {
    if (userId == null) return;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!u || u.status !== "ACTIVE") throw routingRuleInvalidConditionError("assignedToUserId must be an active user");
  }
  /** A rule's destination department must EXIST and be ACTIVE — routing a case
   *  into a retired department would park it where nobody can act on it. Checked
   *  at rule-definition time (here) AND still honoured at complaint-create time
   *  by the assignee-eligibility rules (the backend stays the authority). */
  async function assertDepartment(departmentId: number | null | undefined) {
    if (departmentId == null) return;
    const d = await prisma.department.findUnique({ where: { id: departmentId }, select: { isActive: true } });
    if (!d) throw routingRuleDepartmentInvalidError("department not found");
    if (!d.isActive) throw routingRuleDepartmentInvalidError("department is not active");
  }
  /** The stored shape a rule's condition is compared / validated as. */
  interface RuleShape {
    sourceType: ComplaintSourceType | null;
    factType: RoutingFactType;
    operator: RoutingRuleOperator;
    valueString: string | null;
    valueNumber: number | null;
    valueBool: boolean | null;
  }
  function conditionOf(input: z.infer<typeof CreateRoutingRuleSchema>): RuleShape {
    return {
      sourceType: input.sourceType ?? null, factType: input.factType, operator: input.operator,
      valueString: input.valueString ?? null, valueNumber: input.valueNumber ?? null, valueBool: input.valueBool ?? null,
    };
  }
  function validate(shape: RuleShape) {
    const err = validateRuleCondition(shape);
    if (err) throw routingRuleInvalidConditionError(err);
  }
  /**
   * Merge a PARTIAL update onto the stored rule. `undefined` (field omitted)
   * keeps what is there — a compact form that never showed a field can never
   * erase it. An explicit `null` clears a nullable field. This is the single
   * place that distinction is made.
   */
  function merge<T>(patch: T | null | undefined, current: T | null): T | null {
    return patch === undefined ? current : patch;
  }
  /** The order a new rule takes when the caller does not choose one: AFTER every
   *  existing rule, so creating a rule can never silently pre-empt the ones the
   *  operator already tuned. */
  async function nextSortOrder(): Promise<number> {
    const last = await prisma.complaintRoutingRule.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    return (last?.sortOrder ?? 0) + 10;
  }
  /** The priority a new rule stamps on its complaints when the caller does not
   *  choose one: the CATEGORY's default (the same fallback manual creation uses),
   *  else MEDIUM. The backend owns this — the form never invents a default. */
  async function defaultPriorityFor(categoryId: number): Promise<ComplaintPriority> {
    const cat = await prisma.complaintCategory.findUnique({ where: { id: categoryId }, select: { defaultPriority: true } });
    return cat?.defaultPriority ?? "MEDIUM";
  }
  /** Reject a rule whose condition is byte-for-byte another rule's. Under
   *  first-match-wins the later one could never fire, so it is dead config, not a
   *  harmless duplicate. Compared across ALL rules (an inactive twin becomes live
   *  the moment it is activated). */
  async function assertNotDuplicate(shape: RuleShape, exceptId?: number) {
    const key = ruleConditionKey(shape);
    const siblings = await prisma.complaintRoutingRule.findMany({
      where: exceptId != null ? { id: { not: exceptId } } : {},
      select: { id: true, name: true, sourceType: true, factType: true, operator: true, valueString: true, valueNumber: true, valueBool: true },
    });
    const clash = siblings.find((s) => ruleConditionKey(s) === key);
    if (clash) throw routingRuleDuplicateError(clash.id, clash.name);
  }
  async function createRule(input: z.infer<typeof CreateRoutingRuleSchema>) {
    const shape = conditionOf(input);
    validate(shape);
    await assertCategory(input.categoryId);
    await assertDepartment(input.departmentId);
    await assertNotDuplicate(shape);
    await assertAssignee(input.assignedToUserId);
    const r = await prisma.complaintRoutingRule.create({
      data: {
        name: input.name,
        sortOrder: input.sortOrder ?? (await nextSortOrder()),
        sourceType: shape.sourceType, factType: shape.factType, operator: shape.operator,
        valueString: shape.valueString, valueNumber: shape.valueNumber, valueBool: shape.valueBool,
        categoryId: input.categoryId, departmentId: input.departmentId ?? null, assignedToUserId: input.assignedToUserId ?? null,
        priority: input.priority ?? (await defaultPriorityFor(input.categoryId)),
        active: true,
      },
    });
    return toRule(r);
  }
  /**
   * PARTIAL update. Anything the caller omits keeps its stored value, so a
   * compact form that shows three fields cannot reset the seven it does not.
   * The condition is validated and de-duplicated on the MERGED rule, never on
   * the patch alone — a half-condition can't sneak past the guards.
   */
  async function updateRule(id: number, input: z.infer<typeof UpdateRoutingRuleSchema>) {
    const existing = await prisma.complaintRoutingRule.findUnique({ where: { id } });
    if (!existing) throw routingRuleNotFoundError();
    if (existing.revision !== input.revision) throw routingRuleStaleError(input.revision, existing.revision);

    const shape: RuleShape = {
      sourceType: merge(input.sourceType, existing.sourceType),
      factType: input.factType ?? existing.factType,
      operator: input.operator ?? existing.operator,
      valueString: merge(input.valueString, existing.valueString),
      valueNumber: merge(input.valueNumber, existing.valueNumber),
      valueBool: merge(input.valueBool, existing.valueBool),
    };
    const categoryId = input.categoryId ?? existing.categoryId;
    const departmentId = merge(input.departmentId, existing.departmentId);
    const assignedToUserId = merge(input.assignedToUserId, existing.assignedToUserId);

    validate(shape);
    await assertCategory(categoryId);
    // Only re-checked when the caller actually touched the department: an
    // untouched rule that already points at a since-deactivated department must
    // stay editable (renaming it is exactly how you fix such a rule).
    if (input.departmentId !== undefined) await assertDepartment(departmentId);
    await assertNotDuplicate(shape, id);
    if (input.assignedToUserId !== undefined) await assertAssignee(assignedToUserId);

    const r = await prisma.complaintRoutingRule.update({
      where: { id },
      // `code` is intentionally NOT in the update set, so a customised seed rule
      // keeps its stable code (and the seed can still find it) after editing.
      data: {
        name: input.name ?? existing.name,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        sourceType: shape.sourceType, factType: shape.factType, operator: shape.operator,
        valueString: shape.valueString, valueNumber: shape.valueNumber, valueBool: shape.valueBool,
        categoryId, departmentId, assignedToUserId,
        priority: input.priority ?? existing.priority,
        revision: { increment: 1 },
      },
    });
    return toRule(r);
  }
  async function setActive(id: number, revision: number, active: boolean) {
    const existing = await prisma.complaintRoutingRule.findUnique({ where: { id } });
    if (!existing) throw routingRuleNotFoundError();
    if (existing.revision !== revision) throw routingRuleStaleError(revision, existing.revision);
    return toRule(await prisma.complaintRoutingRule.update({ where: { id }, data: { active, revision: { increment: 1 } } }));
  }
  /**
   * Delete a rule. History is NOT lost: `Complaint.routingRuleId` is `onDelete:
   * SetNull` and every routed complaint already carries an immutable
   * `routingSnapshot` of the outcome, so past cases keep their routing story
   * while the rule stops applying to future events. Optimistic-locked like every
   * other rule write.
   */
  async function deleteRule(id: number, revision: number) {
    const existing = await prisma.complaintRoutingRule.findUnique({ where: { id }, select: { id: true, revision: true } });
    if (!existing) throw routingRuleNotFoundError();
    if (existing.revision !== revision) throw routingRuleStaleError(revision, existing.revision);
    const affectedComplaints = await prisma.complaint.count({ where: { routingRuleId: id } });
    await prisma.complaintRoutingRule.delete({ where: { id } });
    return { id, affectedComplaints };
  }

  async function previewRouting(input: z.infer<typeof RoutingPreviewSchema>) {
    const facts = input.facts ? engine.factsFromPreview(input.facts) : null;
    if (!facts) return { matched: false, ruleId: null, categoryId: null, departmentId: null, priority: null, firstResponseMinutes: null, resolutionMinutes: null };
    const route = await engine.routeFacts(facts);
    if (!route) return { matched: false, ruleId: null, categoryId: null, departmentId: null, priority: null, firstResponseMinutes: null, resolutionMinutes: null };
    const policy = await prisma.complaintSlaPolicy.findUnique({ where: { priority: route.priority } });
    const p = policy ?? DEFAULT_SLA_POLICIES[route.priority];
    return { matched: true, ruleId: route.ruleId, categoryId: route.categoryId, departmentId: route.departmentId, priority: route.priority, firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes };
  }

  // --- SLA policies ---
  async function listPolicies() {
    const rows = await prisma.complaintSlaPolicy.findMany({ orderBy: { priority: "asc" } });
    return rows.map((p) => ({ priority: p.priority, firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes, warningBeforeMinutes: p.warningBeforeMinutes, breachEscalationDelayMinutes: p.breachEscalationDelayMinutes, active: p.active, revision: p.revision }));
  }
  async function updatePolicy(priority: ComplaintPriority, input: z.infer<typeof UpdateSlaPolicySchema>) {
    const existing = await prisma.complaintSlaPolicy.findUnique({ where: { priority } });
    if (!existing) throw slaPolicyNotFoundError();
    if (existing.revision !== input.revision) throw slaPolicyStaleError(input.revision, existing.revision);
    const p = await prisma.complaintSlaPolicy.update({
      where: { priority },
      data: {
        firstResponseMinutes: input.firstResponseMinutes, resolutionMinutes: input.resolutionMinutes, warningBeforeMinutes: input.warningBeforeMinutes,
        breachEscalationDelayMinutes: input.breachEscalationDelayMinutes ?? null, active: input.active ?? existing.active, revision: { increment: 1 },
      },
    });
    return { priority: p.priority, firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes, warningBeforeMinutes: p.warningBeforeMinutes, breachEscalationDelayMinutes: p.breachEscalationDelayMinutes, active: p.active, revision: p.revision };
  }

  return { listCategories, listRules, getRule, createRule, updateRule, setActive, deleteRule, previewRouting, listPolicies, updatePolicy };
}
