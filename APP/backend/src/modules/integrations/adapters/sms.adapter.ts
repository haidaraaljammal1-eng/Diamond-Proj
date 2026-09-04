import type { IntegrationAdapter, OutboundMessage, ResolvedConfig, SendResult, TestResult } from "./types";
import { ok, fail, fetchWithTimeout, mapHttpStatus, classifyNetworkError, readProviderMessageId } from "./types";

function isConfigured(cfg: ResolvedConfig): boolean {
  return Boolean(cfg.secrets.apiKey && cfg.config.baseUrl);
}

/** Single wire path shared by the admin "send test" and real campaign delivery —
 *  a green test proves the exact request a campaign will make. */
async function post(cfg: ResolvedConfig, msg: OutboundMessage): Promise<SendResult> {
  if (!cfg.secrets.apiKey) return { ok: false, code: "NOT_CONFIGURED" };
  if (!cfg.config.baseUrl) return { ok: false, code: "INVALID_CONFIG", detail: "baseUrl required" };
  try {
    const res = await fetchWithTimeout(cfg.config.baseUrl.replace(/\/+$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.secrets.apiKey}`,
        "Content-Type": "application/json",
        ...(cfg.secrets.apiSecret ? { "X-Api-Secret": cfg.secrets.apiSecret } : {}),
      },
      body: JSON.stringify({
        sender: cfg.config.senderId,
        ...(cfg.config.username ? { username: cfg.config.username } : {}),
        to: msg.to,
        body: msg.text,
      }),
    });
    if (!res.ok) return { ok: false, code: mapHttpStatus(res.status) };
    return { ok: true, providerMessageId: await readProviderMessageId(res) };
  } catch (e) {
    const r = classifyNetworkError(e);
    return r.detail ? { ok: false, code: r.code, detail: r.detail } : { ok: false, code: r.code };
  }
}

export const smsAdapter: IntegrationAdapter = {
  isConfigured,
  async testConnection(cfg: ResolvedConfig): Promise<TestResult> {
    if (!cfg.secrets.apiKey) return fail("NOT_CONFIGURED");
    if (!cfg.config.baseUrl) return fail("INVALID_CONFIG", "baseUrl required");
    try {
      // reachability probe: authenticated GET to the gateway base
      const res = await fetchWithTimeout(cfg.config.baseUrl, {
        headers: { Authorization: `Bearer ${cfg.secrets.apiKey}` },
      });
      if (res.ok) return ok();
      return fail(mapHttpStatus(res.status)); // 401/403 -> AUTH_FAILED, 5xx -> PROVIDER_ERROR, etc.
    } catch (e) {
      return classifyNetworkError(e);
    }
  },
  send: post,
  async sendTest(cfg: ResolvedConfig, target): Promise<TestResult> {
    const r = await post(cfg, { to: target.to, text: target.message ?? "Test SMS — integration check." });
    if (r.ok) return ok();
    return r.detail ? fail(r.code ?? "PROVIDER_ERROR", r.detail) : fail(r.code ?? "PROVIDER_ERROR");
  },
};
