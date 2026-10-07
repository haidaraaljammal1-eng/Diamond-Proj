import type { FastifyRequest } from "fastify";
import { env } from "src/config/env";
import {
  calendarDateToStoredUtc,
  parseCalendarDate,
} from "src/modules/contracts/license-calendar";

export const E2E_LICENSE_POLICY_DATE_HEADER = "x-e2e-license-policy-date";

/**
 * Calendar "today" for driving-licence expiry policy only.
 * Production always uses real time. E2E may inject a fixed date via guarded header.
 */
function e2ePolicyClockEnabled(): boolean {
  if (env.NODE_ENV === "production") return false;
  const raw = process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK;
  if (raw !== undefined && raw !== "") {
    return raw === "true" || raw === "1";
  }
  return env.E2E_ALLOW_LICENSE_POLICY_CLOCK;
}

export function resolveLicensePolicyNow(
  request?: Pick<FastifyRequest, "headers">,
  fallback: Date = new Date(),
): Date {
  if (!e2ePolicyClockEnabled()) return fallback;

  const raw = request?.headers[E2E_LICENSE_POLICY_DATE_HEADER];
  const iso = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fallback;

  const cal = parseCalendarDate(iso);
  return cal ? calendarDateToStoredUtc(cal) : fallback;
}
