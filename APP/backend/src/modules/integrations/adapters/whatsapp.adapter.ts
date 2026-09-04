import type { IntegrationAdapter, OutboundMessage, ResolvedConfig, SendResult, TestResult } from "./types";
import { ok, fail, fetchWithTimeout, mapHttpStatus, classifyNetworkError, readProviderMessageId } from "./types";

const graphBase = (cfg: ResolvedConfig) => cfg.config.baseUrl?.replace(/\/+$/, "") || "https://graph.facebook.com/v21.0";

function isConfigured(cfg: ResolvedConfig): boolean {
  if (!cfg.secrets.accessToken) return false;
  if (cfg.config.provider === "meta_cloud") return Boolean(cfg.config.phoneNumberId);
  if (cfg.config.provider === "generic_instance") return Boolean(cfg.config.baseUrl && cfg.config.instanceId);
  return false;
}

/**
 * The single wire path for BOTH the admin "send test" and real campaign delivery.
 * There is deliberately no second implementation: a successful test proves the
 * exact request a campaign will make.
 */
async function post(cfg: ResolvedConfig, msg: OutboundMessage): Promise<SendResult> {
  const token = cfg.secrets.accessToken;
  if (!token) return { ok: false, code: "NOT_CONFIGURED" };
  try {
    if (cfg.config.provider === "meta_cloud") {
      if (!cfg.config.phoneNumberId) return { ok: false, code: "INVALID_CONFIG", detail: "phoneNumberId required" };
      // A pre-approved template is REQUIRED by Meta outside the 24h service window.
      // When the campaign variant names one we send a `template` message; otherwise
      // we send free-form text (valid inside the window / for generic providers).
      const body =
        msg.providerTemplateName
          ? {
              messaging_product: "whatsapp",
              to: msg.to,
              type: "template",
              template: {
                name: msg.providerTemplateName,
                language: { code: msg.providerLanguageCode ?? "en" },
              },
            }
          : { messaging_product: "whatsapp", to: msg.to, type: "text", text: { body: msg.text } };
      const res = await fetchWithTimeout(`${graphBase(cfg)}/${cfg.config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, code: mapHttpStatus(res.status) };
      return { ok: true, providerMessageId: await readProviderMessageId(res) };
    }
    if (!cfg.config.baseUrl || !cfg.config.instanceId) return { ok: false, code: "INVALID_CONFIG" };
    const url = `${cfg.config.baseUrl.replace(/\/+$/, "")}/instance/${encodeURIComponent(cfg.config.instanceId)}/messages`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: msg.to, body: msg.text }),
    });
    if (!res.ok) return { ok: false, code: mapHttpStatus(res.status) };
    return { ok: true, providerMessageId: await readProviderMessageId(res) };
  } catch (e) {
    const r = classifyNetworkError(e);
    return r.detail ? { ok: false, code: r.code, detail: r.detail } : { ok: false, code: r.code };
  }
}

export const whatsappAdapter: IntegrationAdapter = {
  isConfigured,
  async testConnection(cfg: ResolvedConfig): Promise<TestResult> {
    const token = cfg.secrets.accessToken;
    if (!token) return fail("NOT_CONFIGURED");
    try {
      if (cfg.config.provider === "meta_cloud") {
        if (!cfg.config.phoneNumberId) return fail("INVALID_CONFIG", "phoneNumberId required");
        const res = await fetchWithTimeout(`${graphBase(cfg)}/${cfg.config.phoneNumberId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return res.ok ? ok() : fail(mapHttpStatus(res.status));
      }
      // generic_instance: probe instance status
      if (!cfg.config.baseUrl || !cfg.config.instanceId) return fail("INVALID_CONFIG");
      const url = `${cfg.config.baseUrl.replace(/\/+$/, "")}/instance/${encodeURIComponent(cfg.config.instanceId)}/status`;
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.ok ? ok() : fail(mapHttpStatus(res.status));
    } catch (e) {
      return classifyNetworkError(e);
    }
  },
  send: post,
  async sendTest(cfg: ResolvedConfig, target): Promise<TestResult> {
    const r = await post(cfg, { to: target.to, text: target.message ?? "Test message — WhatsApp integration check." });
    if (r.ok) return ok();
    return r.detail ? fail(r.code ?? "PROVIDER_ERROR", r.detail) : fail(r.code ?? "PROVIDER_ERROR");
  },
};
