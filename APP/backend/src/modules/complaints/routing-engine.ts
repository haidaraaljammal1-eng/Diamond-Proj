import type { PrismaClient } from "@prisma/client";
import type { ComplaintPriority } from "@prisma/client";
import { resolveMatch, type RoutingFacts } from "src/modules/complaints/routing";
import { DEFAULT_SLA_POLICIES } from "src/modules/complaints/sla";

export interface RouteResult {
  ruleId: number;
  categoryId: number;
  departmentId: number | null;
  /** The rule's suggested assignee, if it names one. The complaint service sets
   *  it on the created complaint and derives the department from them. */
  assignedToUserId: number | null;
  priority: ComplaintPriority;
  snapshot: Record<string, unknown>;
}

/** Typed facts a routing preview can be built from without a real source. */
export interface PreviewFacts {
  sourceType: RoutingFacts["sourceType"];
  complaintRequested?: boolean | null;
}

export function createRoutingEngine(prisma: PrismaClient) {
  /** Load active rules (ordered) + first-match; snapshot the outcome for immutability. */
  async function routeFacts(facts: RoutingFacts): Promise<RouteResult | null> {
    // EXECUTION ORDER IS THE ONLY AUTHORITY. `sortOrder` decides which rule is
    // evaluated first; `createdAt` then `id` are the deterministic tie-breakers
    // for rules that share an order, so the winner can never depend on the
    // database's return order. A rule's `priority` is the priority of the CASE it
    // opens — it takes no part in ordering and must never be used for it.
    const rules = await prisma.complaintRoutingRule.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    const match = resolveMatch(rules, facts);
    if (!match) return null;
    const category = await prisma.complaintCategory.findUnique({ where: { id: match.categoryId }, select: { defaultDepartmentId: true } });
    const departmentId = match.departmentId ?? category?.defaultDepartmentId ?? null;
    const policy = DEFAULT_SLA_POLICIES[match.priority];
    return {
      ruleId: match.id, categoryId: match.categoryId, departmentId, assignedToUserId: match.assignedToUserId ?? null, priority: match.priority,
      snapshot: { ruleId: match.id, categoryId: match.categoryId, departmentId, assignedToUserId: match.assignedToUserId ?? null, priority: match.priority, firstResponseMinutes: policy.firstResponseMinutes, resolutionMinutes: policy.resolutionMinutes },
    };
  }

  function factsFromPreview(input: PreviewFacts): RoutingFacts {
    return {
      sourceType: input.sourceType,
      complaintRequested: input.complaintRequested ?? null,
    };
  }

  return { routeFacts, factsFromPreview };
}
