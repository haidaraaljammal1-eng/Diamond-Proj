import { env } from "src/config/env";

/** Supported operating companies with independent TARS integrations. */
export const TARS_COMPANY_CODES = ["UNIQUE", "ELITE"] as const;
export type TarsCompanyCode = (typeof TARS_COMPANY_CODES)[number];

/**
 * Per-company TARS configuration namespace. Values are read from
 * `TARS_<COMPANY>_*` environment variables. No credentials are invented or
 * committed — empty strings mean not configured.
 */
export interface TarsCompanyConfig {
  companyCode: TarsCompanyCode;
  /** Operator intent for this company's integration. */
  enabled: boolean;
  baseUrl: string | null;
  authUrl: string | null;
  agencyDid: string | null;
  clientId: string | null;
  clientSecret: string | null;
  apiVersion: string | null;
  timeoutMs: number;
  statusPollIntervalMs: number | null;
  /**
   * True when the minimum credential shell exists for a future live adapter.
   * Does NOT mean live TARS is verified — only that env placeholders are present.
   */
  credentialsShellPresent: boolean;
}

function readCompanyEnv(companyCode: TarsCompanyCode, suffix: string): string {
  const key = `TARS_${companyCode}_${suffix}` as keyof typeof env;
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : "";
}

function parseOptionalInt(raw: string): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTarsCompanyConfig(companyCode: string): TarsCompanyConfig {
  const code = (TARS_COMPANY_CODES as readonly string[]).includes(companyCode)
    ? (companyCode as TarsCompanyCode)
    : companyCode.toUpperCase() as TarsCompanyCode;

  const baseUrl = readCompanyEnv(code, "BASE_URL") || null;
  const authUrl = readCompanyEnv(code, "AUTH_URL") || null;
  const agencyDid = readCompanyEnv(code, "AGENCY_DID") || null;
  const clientId = readCompanyEnv(code, "CLIENT_ID") || null;
  const clientSecret = readCompanyEnv(code, "CLIENT_SECRET") || null;
  const apiVersion = readCompanyEnv(code, "API_VERSION") || null;
  const timeoutRaw = readCompanyEnv(code, "TIMEOUT_MS");
  const pollRaw = readCompanyEnv(code, "STATUS_POLL_INTERVAL_MS");
  const enabledRaw = readCompanyEnv(code, "ENABLED");

  const credentialsShellPresent = Boolean(baseUrl && clientId && clientSecret);

  return {
    companyCode: code,
    enabled: enabledRaw === "true" || enabledRaw === "1" || env.TARS_ENABLED,
    baseUrl,
    authUrl,
    agencyDid,
    clientId,
    clientSecret,
    apiVersion,
    timeoutMs: parseOptionalInt(timeoutRaw) ?? 30_000,
    statusPollIntervalMs: parseOptionalInt(pollRaw),
    credentialsShellPresent,
  };
}

/** @deprecated Use getTarsCompanyConfig — kept for existing service callers. */
export interface TarsConfig {
  enabled: boolean;
  companyCode: string;
}

export function getTarsConfig(companyCode: string): TarsConfig {
  const company = getTarsCompanyConfig(companyCode);
  return { enabled: company.enabled, companyCode: company.companyCode };
}
