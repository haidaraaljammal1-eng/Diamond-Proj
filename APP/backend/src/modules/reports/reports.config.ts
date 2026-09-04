import type { FastifyInstance } from "fastify";

/** Typed settings for reporting + security posture (first-class, overridable). */
export const REPORT_SETTING_KEYS = {
  TIMEZONE_OFFSET_MINUTES: "reports.timezone_offset_minutes",
  AUDIT_RETENTION_DAYS: "security.audit_retention_days",
  DATA_RESIDENCY_REGION: "security.data_residency_region",
  ACTION_LINK_EXPIRY_DAYS: "communication.default_action_link_expiry_days",
  API_RATE_LIMIT_PER_MINUTE: "api.rate_limit_per_minute",
} as const;

export const REPORT_EXPORT_ROW_LIMIT = 10_000;
export const AUDIT_EXPORT_ROW_LIMIT = 50_000;

export interface ReportConfig {
  timezoneOffsetMinutes: number; // business tz (Asia/Riyadh = 180, no DST)
  auditRetentionDays: number;
  dataResidencyRegion: string | null;
  actionLinkExpiryDays: number | null;
  apiRateLimitPerMinute: number;
}

const K = REPORT_SETTING_KEYS;

export async function loadReportConfig(fastify: FastifyInstance): Promise<ReportConfig> {
  const s = fastify.settings;
  const expiry = await s.getNumber(K.ACTION_LINK_EXPIRY_DAYS, 0);
  return {
    timezoneOffsetMinutes: await s.getNumber(K.TIMEZONE_OFFSET_MINUTES, 180),
    auditRetentionDays: await s.getNumber(K.AUDIT_RETENTION_DAYS, 1825),
    dataResidencyRegion: (await s.get(K.DATA_RESIDENCY_REGION)) ?? null,
    actionLinkExpiryDays: expiry > 0 ? expiry : null,
    apiRateLimitPerMinute: await s.getNumber(K.API_RATE_LIMIT_PER_MINUTE, 120),
  };
}
