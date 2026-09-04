import type { ComplaintStage } from "@prisma/client";

/**
 * Simplified 5-stage processing model: NEW · IN_PROGRESS · WAITING · RESOLVED ·
 * CLOSED. The stage is a free operational POSITION — an authorized user may move a
 * complaint to any stage in any order (no transition matrix, no mandatory
 * sequence). The only rules that remain are lifecycle protections, expressed here:
 * RESOLVED / CLOSED are reached ONLY through the dedicated resolve / close / reopen
 * operations (never the generic stage picker); escalation is orthogonal to stage.
 */

/** The operational stages the generic stage picker may set (free movement). */
export const OPERATIONAL_STAGES: ComplaintStage[] = ["NEW", "IN_PROGRESS", "WAITING"];

/** Stages a generic `transition` can never target — they are formal lifecycle
 *  actions (resolve / close), not a stage you pick. */
export const NON_GENERIC_TARGETS: ComplaintStage[] = ["RESOLVED", "CLOSED"];

/**
 * First response = the first move out of NEW (acknowledgement) OR the first
 * customer-visible communication action. Centralized so `firstRespondedAt` and
 * the first-response KPI share one definition.
 */
export function qualifiesAsFirstResponse(newStage: ComplaintStage): boolean {
  return newStage !== "NEW";
}

/** The stage a complaint returns to on reopen (handling resumes). */
export const REOPEN_STAGE: ComplaintStage = "IN_PROGRESS";
