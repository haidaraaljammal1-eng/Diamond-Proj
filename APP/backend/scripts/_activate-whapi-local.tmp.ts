/**
 * One-off local Whapi activation helper. Do not commit. No message sends.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { extractWhapiHealthStatusText } from "src/modules/whatsapp/whapi.status";
import { whapiRuntimeConfig } from "src/modules/whatsapp/whapi.config";
import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

const BASE = `http://localhost:${env.PORT}`;

function redactEnvCheck() {
  return {
    envFile: "APP/backend/.env (dotenv/config from process cwd)",
    WHATSAPP_PROVIDER: env.WHATSAPP_PROVIDER,
    WHAPI_API_URL: env.WHAPI_API_URL.trim() ? "[set]" : "[empty]",
    WHAPI_CHANNEL_ID: env.WHAPI_CHANNEL_ID,
    WHAPI_TOKEN: env.WHAPI_TOKEN.trim().length > 0 ? `[set len=${env.WHAPI_TOKEN.trim().length}]` : "[empty]",
    WHAPI_WEBHOOK_SECRET: env.WHAPI_WEBHOOK_SECRET.trim().length > 0 ? "[set]" : "[empty]",
    WHAPI_WEBHOOK_CALLBACK_KEY: env.WHAPI_WEBHOOK_CALLBACK_KEY.trim().length > 0 ? "[set]" : "[empty]",
  };
}

async function healthProbe() {
  const cfg = whapiRuntimeConfig();
  const client = new WhapiClient({ apiUrl: cfg.apiUrl, token: cfg.token });
  const { status, json } = await client.getJson("/health");
  const statusText = extractWhapiHealthStatusText(json);
  const body = json as Record<string, unknown>;
  const channel =
    typeof body?.channel_id === "string"
      ? body.channel_id
      : typeof (body?.user as Record<string, unknown>)?.id === "string"
        ? (body.user as Record<string, unknown>).id
        : null;
  return { httpStatus: status, statusText, channelId: channel, jsonSanitized: { status: (body?.status as object) ?? null } };
}

async function login(): Promise<string> {
  const email = env.DEV_ADMIN_EMAIL;
  const password = env.DEV_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("DEV_ADMIN credentials missing");
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as {
    data?: { requiresTwoFactor?: boolean; accessToken?: string };
  };
  if (!res.ok) throw new Error(`login http ${res.status}`);
  if (body.data?.requiresTwoFactor) throw new Error("2FA required for dev admin");
  const token = body.data?.accessToken;
  if (!token) throw new Error("no access token");
  return token;
}

async function apiGetConnection(token: string) {
  const res = await fetch(`${BASE}/whatsapp/connection`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function apiBootstrap(token: string) {
  const res = await fetch(`${BASE}/whatsapp/connection/bootstrap`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function readDbRow() {
  const row = await prisma.whatsAppConnection.findFirst({
    where: { status: { not: "DISCONNECTED" } },
    orderBy: { connectedAt: "desc" },
    select: {
      provider: true,
      status: true,
      providerSessionStatus: true,
      providerInstanceId: true,
      phoneNumberId: true,
      credentialCiphertext: true,
      connectedAt: true,
      lastValidatedAt: true,
      providerSessionCheckedAt: true,
      webhookStatus: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    credentialCiphertext: row.credentialCiphertext ? `[encrypted len=${row.credentialCiphertext.length}]` : null,
  };
}

async function main() {
  const provider = createWhatsAppProvider();
  const envCheck = redactEnvCheck();
  const health = await healthProbe();
  const session = await provider.getSession(env.WHAPI_TOKEN.trim());

  console.log(
    JSON.stringify(
      {
        step: "env",
        ...envCheck,
        providerSelected: provider.name,
        providerConfigured: provider.configured,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        step: "health",
        httpStatus: health.httpStatus,
        statusText: health.statusText,
        channelId: health.channelId,
        mappedSession: session.ok ? session.value.status : null,
        rawStatus: session.ok ? session.value.rawStatus : null,
      },
      null,
      2,
    ),
  );

  if (health.httpStatus !== 200 || health.statusText?.toUpperCase() !== "AUTH") {
    console.log(JSON.stringify({ step: "stop", reason: "health not AUTH" }, null, 2));
    process.exit(1);
  }

  const token = await login();
  const before = await apiGetConnection(token);
  const boot = await apiBootstrap(token);
  const after = await apiGetConnection(token);
  const db = await readDbRow();

  console.log(
    JSON.stringify(
      {
        step: "bootstrap",
        beforeConnection: before,
        bootstrap: boot,
        afterConnection: after,
        db,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ step: "error", message: String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
