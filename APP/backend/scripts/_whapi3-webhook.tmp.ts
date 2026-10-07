/**
 * WHAPI-3 local webhook activation diagnostic. Do not commit. No message sends.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { extractWhapiHealthStatusText } from "src/modules/whatsapp/whapi.status";
import { whapiRuntimeConfig, diamondWhapiWebhookUrl, whapiWebhookSecretHeaderName } from "src/modules/whatsapp/whapi.config";
import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const BASE = `http://localhost:${env.PORT}`;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function sanitizeSettings(json: unknown) {
  const body = asRecord(json) ?? {};
  const webhooks = Array.isArray(body.webhooks) ? body.webhooks : null;
  const first = webhooks?.[0] && typeof webhooks[0] === "object" ? (webhooks[0] as Record<string, unknown>) : null;
  const headers = asRecord(first?.headers) ?? asRecord(body.headers);
  const headerNames = headers ? Object.keys(headers) : [];
  const events = Array.isArray(first?.events) ? first.events : null;
  const eventPairs = events?.map((e) => {
    const r = asRecord(e);
    return r ? `${String(r.type)}/${String(r.method)}` : "?";
  });
  return {
    webhook_url: typeof body.webhook_url === "string" ? body.webhook_url : typeof first?.url === "string" ? first.url : null,
    mode: first?.mode ?? body.mode ?? null,
    messages: body.messages,
    statuses: body.statuses,
    auto_download: body.auto_download,
    customSecretHeaderConfigured: headerNames.some((h) => h.toLowerCase() === whapiWebhookSecretHeaderName().toLowerCase()),
    headerNames,
    eventPairs,
  };
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: env.DEV_ADMIN_EMAIL, password: env.DEV_ADMIN_PASSWORD }),
  });
  const body = (await res.json()) as { data?: { accessToken?: string; requiresTwoFactor?: boolean } };
  if (!res.ok || body.data?.requiresTwoFactor || !body.data?.accessToken) throw new Error(`login failed ${res.status}`);
  return body.data.accessToken;
}

async function main() {
  const cfg = whapiRuntimeConfig();
  const client = new WhapiClient({ apiUrl: cfg.apiUrl, token: cfg.token });
  let health: { status: number; json: unknown };
  try {
    health = await client.getJson("/health");
  } catch (e) {
    console.log(JSON.stringify({ step: "health_failed", error: String(e) }));
    process.exit(1);
  }
  const provider = createWhatsAppProvider();

  const token = await login();
  const connBefore = await fetch(`${BASE}/whatsapp/connection`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const connBeforeJson = await connBefore.json();

  const callbackKey = env.WHAPI_WEBHOOK_CALLBACK_KEY.trim();
  const webhookPath = callbackKey ? `/whatsapp/webhooks/whapi/${encodeURIComponent(callbackKey)}` : null;
  let tunnelProbe: { status: number; code?: string } | null = null;
  if (env.PUBLIC_BACKEND_URL.trim() && webhookPath) {
    const url = `${env.PUBLIC_BACKEND_URL.replace(/\/+$/, "")}${webhookPath}`;
    const probe = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const probeJson = (await probe.json()) as { error?: { code?: string } };
    tunnelProbe = { status: probe.status, code: probeJson.error?.code };
  }

  const activate = await fetch(`${BASE}/whatsapp/connection/webhook/activate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const activateJson = await activate.json();

  const settings = await client.getJson("/settings");
  const connAfter = await fetch(`${BASE}/whatsapp/connection`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const connAfterJson = await connAfter.json();

  const webhookUrl = diamondWhapiWebhookUrl(callbackKey);
  let webhookTest: { status: number; json: unknown } | { error: string } | null = null;
  if (webhookUrl) {
    try {
      webhookTest = await client.postJson("/settings/webhook_test", {
        url: webhookUrl,
        mode: "body",
        type: "messages",
      });
    } catch (e) {
      webhookTest = { error: e instanceof Error ? e.name : "unknown" };
    }
  }

  const row = await prisma.whatsAppConnection.findFirst({
    where: { provider: "WHAPI", status: "LINKED" },
    select: {
      providerInstanceId: true,
      webhookStatus: true,
      lastWebhookAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        health: {
          http: health.status,
          statusText: extractWhapiHealthStatusText(health.json),
          channel: asRecord(health.json)?.channel_id ?? null,
        },
        provider: provider.name,
        publicBackendUrlHost: (() => {
          try {
            return new URL(env.PUBLIC_BACKEND_URL).hostname;
          } catch {
            return null;
          }
        })(),
        configureWebhook: env.WHAPI_CONFIGURE_WEBHOOK,
        callbackKeyPresent: callbackKey.length > 0,
        secretPresent: env.WHAPI_WEBHOOK_SECRET.trim().length > 0,
        connectionBefore: connBeforeJson,
        tunnelProbeInvalidSecret: tunnelProbe,
        webhookActivate: { status: activate.status, data: activateJson },
        whapiSettingsSanitized: sanitizeSettings(settings.json),
        connectionAfter: connAfterJson,
        webhookTest:
          webhookTest && "status" in webhookTest
            ? { http: webhookTest.status, body: webhookTest.json }
            : webhookTest,
        dbWebhook: row,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ error: String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
