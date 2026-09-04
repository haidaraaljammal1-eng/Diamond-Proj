import type { IntegrationAdapter, ResolvedConfig, TestResult } from "./types";
import { ok, fail, fetchWithTimeout, mapHttpStatus, classifyNetworkError } from "./types";

export const powerbiAdapter: IntegrationAdapter = {
  async testConnection(cfg: ResolvedConfig): Promise<TestResult> {
    const { tenantId, clientId, workspaceId, reportId } = cfg.config;
    if (!tenantId || !clientId || !cfg.secrets.clientSecret) return fail("NOT_CONFIGURED");
    if (!workspaceId || !reportId) return fail("INVALID_CONFIG", "workspaceId and reportId required");
    try {
      const tokenRes = await fetchWithTimeout(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: cfg.secrets.clientSecret,
          scope: "https://analysis.windows.net/powerbi/api/.default",
        }).toString(),
      });
      if (tokenRes.status === 401 || tokenRes.status === 403) return fail("AUTH_FAILED");
      if (!tokenRes.ok) return fail(mapHttpStatus(tokenRes.status));
      const { access_token } = (await tokenRes.json()) as { access_token?: string };
      if (!access_token) return fail("AUTH_FAILED", "no access_token");
      const reportRes = await fetchWithTimeout(
        `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      );
      return reportRes.ok ? ok() : fail(mapHttpStatus(reportRes.status), "report not accessible");
    } catch (e) {
      return classifyNetworkError(e);
    }
  },
};
