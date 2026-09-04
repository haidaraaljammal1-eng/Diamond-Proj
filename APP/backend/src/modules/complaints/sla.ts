import type { ComplaintPriority } from "@prisma/client";

/**
 * SLA clock. This phase uses ELAPSED / CALENDAR time (no business-hours or
 * holiday calendar — that infrastructure does not exist yet). The warning fires
 * `warningBeforeMinutes` ahead of the RESOLUTION deadline. All values are minutes.
 */
export interface SlaPolicySnapshot {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  warningBeforeMinutes: number;
}

export interface SlaCycleTimes {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  warningAt: Date;
}

const MIN_MS = 60_000;

export function computeCycleTimes(policy: SlaPolicySnapshot, startedAt: Date): SlaCycleTimes {
  const resolutionDueAt = new Date(startedAt.getTime() + policy.resolutionMinutes * MIN_MS);
  return {
    firstResponseDueAt: new Date(startedAt.getTime() + policy.firstResponseMinutes * MIN_MS),
    resolutionDueAt,
    warningAt: new Date(resolutionDueAt.getTime() - policy.warningBeforeMinutes * MIN_MS),
  };
}

/** Seed defaults (configurable via ComplaintSlaPolicy — NOT hardcoded in services). */
export const DEFAULT_SLA_POLICIES: Record<ComplaintPriority, { firstResponseMinutes: number; resolutionMinutes: number; warningBeforeMinutes: number; breachEscalationDelayMinutes: number | null }> = {
  CRITICAL: { firstResponseMinutes: 30, resolutionMinutes: 8 * 60, warningBeforeMinutes: 60, breachEscalationDelayMinutes: 0 },
  URGENT: { firstResponseMinutes: 120, resolutionMinutes: 24 * 60, warningBeforeMinutes: 240, breachEscalationDelayMinutes: 360 },
  HIGH: { firstResponseMinutes: 240, resolutionMinutes: 48 * 60, warningBeforeMinutes: 480, breachEscalationDelayMinutes: null },
  MEDIUM: { firstResponseMinutes: 480, resolutionMinutes: 4 * 24 * 60, warningBeforeMinutes: 24 * 60, breachEscalationDelayMinutes: null },
  LOW: { firstResponseMinutes: 24 * 60, resolutionMinutes: 7 * 24 * 60, warningBeforeMinutes: 2 * 24 * 60, breachEscalationDelayMinutes: null },
};
