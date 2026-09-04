import type { IntegrationAdapter, ResolvedConfig, TestResult } from "./types";
import { ok, fail, fetchWithTimeout, mapHttpStatus, classifyNetworkError } from "./types";

// CRM sync connector — a generic REST integration keyed by a base URL + API key.
// It is a DATA connector, not a messaging channel, so there is no `send`/`sendTest`;
// `testConnection` proves the base URL is reachable and the API key is accepted.
//
// The auth header follows the selected provider's convention (best-effort): Salesforce
// and HubSpot take a Bearer token; a generic REST CRM likewise. This is a reachability
// + credential check, never a data write — a green result means "we can talk to it".

function authHeaders(cfg: ResolvedConfig): Record<string, string> {
  const key = cfg.secrets.apiKey ?? "";
  // HubSpot private-app + Salesforce session tokens are both sent as Bearer; a
  // generic REST CRM is assumed the same. If a specific CRM needs a different scheme
  // this is where it is added.
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}

export const crmAdapter: IntegrationAdapter = {
  isConfigured(cfg: ResolvedConfig): boolean {
    return Boolean(cfg.config.baseUrl && cfg.secrets.apiKey);
  },

  async testConnection(cfg: ResolvedConfig): Promise<TestResult> {
    const baseUrl = cfg.config.baseUrl?.replace(/\/+$/, "");
    if (!baseUrl || !cfg.secrets.apiKey) return fail("NOT_CONFIGURED");
    try {
      const res = await fetchWithTimeout(baseUrl, { headers: authHeaders(cfg) });
      if (res.status === 401 || res.status === 403) return fail("AUTH_FAILED", "API key rejected");
      // Any reachable + authorized response (including 404 on the bare base URL, which
      // just means there is no resource at the root) proves the endpoint is live and
      // the credentials are accepted. Only a 5xx / network failure is a real problem.
      if (res.status >= 500) return fail(mapHttpStatus(res.status), "CRM endpoint error");
      return ok();
    } catch (e) {
      return classifyNetworkError(e);
    }
  },
};
