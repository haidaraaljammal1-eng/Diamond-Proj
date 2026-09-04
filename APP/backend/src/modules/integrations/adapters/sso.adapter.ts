import type { IntegrationAdapter, ResolvedConfig, TestResult } from "./types";
import { ok, fail, fetchWithTimeout, mapHttpStatus, classifyNetworkError } from "./types";

function discoveryUrl(cfg: ResolvedConfig): string | null {
  const issuer = cfg.config.issuerUrl?.replace(/\/+$/, "");
  if (issuer) return `${issuer}/.well-known/openid-configuration`;
  if (cfg.config.provider === "entra" && cfg.config.tenantId)
    return `https://login.microsoftonline.com/${cfg.config.tenantId}/v2.0/.well-known/openid-configuration`;
  return null;
}

export const ssoAdapter: IntegrationAdapter = {
  async testConnection(cfg: ResolvedConfig): Promise<TestResult> {
    if (!cfg.config.clientId || !cfg.secrets.clientSecret) return fail("NOT_CONFIGURED");
    const url = discoveryUrl(cfg);
    if (!url) return fail("INVALID_CONFIG", "issuerUrl or tenantId required");
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) return fail(mapHttpStatus(res.status), "discovery document unreachable");
      const doc = (await res.json()) as { token_endpoint?: string };
      if (!doc.token_endpoint) return fail("INVALID_CONFIG", "no token_endpoint in discovery");
      // client-credentials validation (best-effort: proves clientId/secret against the IdP)
      const tokenRes = await fetchWithTimeout(cfg.config.tokenUrl || doc.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: cfg.config.clientId,
          client_secret: cfg.secrets.clientSecret,
          scope: cfg.config.provider === "entra" ? "https://graph.microsoft.com/.default" : "openid",
        }).toString(),
      });
      if (tokenRes.status === 401 || tokenRes.status === 403) return fail("AUTH_FAILED", "client credentials rejected");
      if (tokenRes.status >= 500) return fail("PROVIDER_ERROR", "identity provider error");
      // Discovery document was reachable + parseable and the client is recognized; some IdPs
      // disallow client_credentials for interactive apps (e.g. 400 unsupported_grant), which is
      // NOT an error for config validation. Structurally valid config -> ok.
      return ok();
    } catch (e) {
      return classifyNetworkError(e);
    }
  },
};
