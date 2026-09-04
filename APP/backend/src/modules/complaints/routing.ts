import type { ComplaintSourceType, RoutingFactType, RoutingRuleOperator } from "@prisma/client";

/**
 * Deterministic, typed complaint routing engine. Conditions are structured
 * columns — NO eval, NO free JSON logic. Rules are pre-sorted (sortOrder ASC,
 * id ASC) and FIRST_MATCH_WINS, so one source event opens at most one complaint.
 */

export interface RoutingFacts {
  sourceType: ComplaintSourceType;
  complaintRequested: boolean | null;
}

export interface RoutingRuleCondition {
  sourceType: ComplaintSourceType | null;
  factType: RoutingFactType;
  operator: RoutingRuleOperator;
  valueString: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
}

function compareString(actual: string | null, op: RoutingRuleOperator, expected: string | null): boolean {
  if (actual == null || expected == null) return false;
  switch (op) {
    case "EQUALS": return actual === expected;
    case "NOT_EQUALS": return actual !== expected;
    case "IN": return expected.split(",").map((s) => s.trim()).includes(actual);
    default: return false;
  }
}

/** Evaluate one rule against the facts. Pure, side-effect-free. */
export function evaluateRule(rule: RoutingRuleCondition, facts: RoutingFacts): boolean {
  if (rule.sourceType != null && rule.sourceType !== facts.sourceType) return false;

  switch (rule.factType) {
    case "SOURCE_TYPE": return compareString(facts.sourceType, rule.operator, rule.valueString);
    case "COMPLAINT_REQUESTED": return rule.operator === "IS_TRUE" && facts.complaintRequested === true;
    default: return false;
  }
}

/** First matching rule (rules must already be ordered sortOrder ASC, id ASC). */
export function resolveMatch<T extends RoutingRuleCondition & { active: boolean }>(rules: T[], facts: RoutingFacts): T | null {
  for (const rule of rules) {
    if (!rule.active) continue;
    if (evaluateRule(rule, facts)) return rule;
  }
  return null;
}

/** Validate a rule's typed condition is coherent (used at rule create/update). */
export function validateRuleCondition(rule: RoutingRuleCondition): string | null {
  const boolFacts: RoutingFactType[] = ["COMPLAINT_REQUESTED"];
  const stringFacts: RoutingFactType[] = ["SOURCE_TYPE"];

  if (boolFacts.includes(rule.factType) && rule.operator !== "IS_TRUE") return "boolean facts require the IS_TRUE operator";
  if (stringFacts.includes(rule.factType) && rule.valueString == null) return "valueString is required for this fact type";
  return null;
}

/**
 * The identity of a rule's CONDITION — the scope + typed test, with no outcome.
 * Two rules with the same key are exact duplicates: the second can never fire
 * (first-match-wins), so it is silently dead. Used to reject duplicates at
 * create/update time. Stable and order-independent by construction.
 */
export function ruleConditionKey(rule: RoutingRuleCondition): string {
  return [
    rule.sourceType ?? "*",
    rule.factType,
    rule.operator,
    rule.valueString ?? "*",
    rule.valueNumber ?? "*",
    rule.valueBool ?? "*",
  ].join("|");
}
