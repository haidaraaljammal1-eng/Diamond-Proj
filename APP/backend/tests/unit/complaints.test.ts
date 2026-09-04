import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRule, resolveMatch, validateRuleCondition, type RoutingFacts, type RoutingRuleCondition } from "src/modules/complaints/routing";
import { OPERATIONAL_STAGES, NON_GENERIC_TARGETS, qualifiesAsFirstResponse, REOPEN_STAGE } from "src/modules/complaints/state-machine";
import { computeCycleTimes, DEFAULT_SLA_POLICIES } from "src/modules/complaints/sla";

function facts(partial: Partial<RoutingFacts>): RoutingFacts {
  return { sourceType: "CALL_CENTER", complaintRequested: null, ...partial };
}
function rule(partial: Partial<RoutingRuleCondition>): RoutingRuleCondition {
  return { sourceType: null, factType: "SOURCE_TYPE", operator: "EQUALS", valueString: null, valueNumber: null, valueBool: null, ...partial };
}

test("routing: source type EQUALS / IN", () => {
  assert.equal(evaluateRule(rule({ factType: "SOURCE_TYPE", operator: "EQUALS", valueString: "CALL_CENTER" }), facts({ sourceType: "CALL_CENTER" })), true);
  assert.equal(evaluateRule(rule({ factType: "SOURCE_TYPE", operator: "EQUALS", valueString: "MANUAL" }), facts({ sourceType: "CALL_CENTER" })), false);
  assert.equal(evaluateRule(rule({ factType: "SOURCE_TYPE", operator: "IN", valueString: "MANUAL,CALL_CENTER" }), facts({ sourceType: "CALL_CENTER" })), true);
});

test("routing: complaintRequested IS_TRUE", () => {
  assert.equal(evaluateRule(rule({ factType: "COMPLAINT_REQUESTED", operator: "IS_TRUE" }), facts({ complaintRequested: true })), true);
  assert.equal(evaluateRule(rule({ factType: "COMPLAINT_REQUESTED", operator: "IS_TRUE" }), facts({ complaintRequested: false })), false);
});

test("routing: source scoping narrows a rule", () => {
  const r = rule({ factType: "COMPLAINT_REQUESTED", operator: "IS_TRUE", sourceType: "CALL_CENTER" });
  assert.equal(evaluateRule(r, facts({ sourceType: "MANUAL", complaintRequested: true })), false);
  assert.equal(evaluateRule(r, facts({ sourceType: "CALL_CENTER", complaintRequested: true })), true);
});

test("routing: resolveMatch is first-match by order, skips inactive", () => {
  const rules = [
    { ...rule({ factType: "SOURCE_TYPE", operator: "EQUALS", valueString: "CALL_CENTER" }), active: false, id: 1 },
    { ...rule({ factType: "SOURCE_TYPE", operator: "IN", valueString: "MANUAL,CALL_CENTER" }), active: true, id: 2, tag: "A" },
    { ...rule({ factType: "SOURCE_TYPE", operator: "EQUALS", valueString: "CALL_CENTER" }), active: true, id: 3, tag: "B" },
  ];
  const m = resolveMatch(rules, facts({ sourceType: "CALL_CENTER" }));
  assert.equal((m as { tag?: string })?.tag, "A", "first active match wins; inactive skipped");
});

test("routing: validateRuleCondition catches incoherent rules", () => {
  assert.ok(validateRuleCondition(rule({ factType: "COMPLAINT_REQUESTED", operator: "EQUALS" })), "boolean fact needs IS_TRUE");
  assert.ok(validateRuleCondition(rule({ factType: "SOURCE_TYPE", operator: "EQUALS", valueString: null })), "missing valueString");
  assert.equal(validateRuleCondition(rule({ factType: "COMPLAINT_REQUESTED", operator: "IS_TRUE" })), null, "coherent");
});

test("stages: 5-value model, free operational movement, formal terminal targets", () => {
  // Simplified model — the picker offers exactly the 3 operational stages, freely.
  assert.deepEqual([...OPERATIONAL_STAGES], ["NEW", "IN_PROGRESS", "WAITING"]);
  // RESOLVED / CLOSED are formal lifecycle actions, never a generic stage target.
  assert.ok(NON_GENERIC_TARGETS.includes("RESOLVED") && NON_GENERIC_TARGETS.includes("CLOSED"));
  assert.ok(!OPERATIONAL_STAGES.includes("RESOLVED") && !OPERATIONAL_STAGES.includes("CLOSED"));
  // Reopen resumes handling in IN_PROGRESS.
  assert.equal(REOPEN_STAGE, "IN_PROGRESS");
  assert.equal(qualifiesAsFirstResponse("NEW"), false);
  assert.equal(qualifiesAsFirstResponse("IN_PROGRESS"), true);
});

test("sla: cycle deadlines from policy snapshot (warning relative to resolution)", () => {
  const start = new Date("2026-07-17T00:00:00.000Z");
  const t = computeCycleTimes(DEFAULT_SLA_POLICIES.CRITICAL, start);
  assert.equal(t.firstResponseDueAt.getTime(), start.getTime() + 30 * 60000);
  assert.equal(t.resolutionDueAt.getTime(), start.getTime() + 8 * 3600000);
  assert.equal(t.warningAt.getTime(), t.resolutionDueAt.getTime() - 60 * 60000);
});
