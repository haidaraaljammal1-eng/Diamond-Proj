import type { FastifyInstance } from "fastify";
import { INTEGRATION_CATALOG, getDescriptor, configFieldKeys, secretFieldKeys, type CatalogKind } from "./catalog";
import { decryptSecretBlob, encryptSecretBlob, mergeSecrets, secretHints } from "./secret-blob";
import { getAdapter } from "./adapters";
import type { ResolvedConfig } from "./adapters/types";
import { env } from "src/config/env";

type Row = {
  id: number; kind: string; name: string; status: string; configured: boolean; enabled: boolean;
  lastHealthCheckAt: Date | null; lastSuccessAt: Date | null; lastErrorCode: string | null;
  metadata: unknown; secretEncrypted: string | null;
};

/** Catalog ensure / save / DTO / test-send orchestration for the 5 managed
 *  integrations. Non-secret config lives in `metadata`; secrets are encrypted
 *  into `secretEncrypted` and never leave this module unmasked. Status is
 *  always derived from a real outcome — never hardcoded to a healthy state. */
export function createIntegrationConfigService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  function redirectUrlFor(kind: CatalogKind): string | undefined {
    if (kind !== "SSO_ACTIVE_DIRECTORY") return undefined;
    return `${env.FRONTEND_URL.replace(/\/+$/, "")}/api/auth/callback/corporate-sso`;
  }

  function toDto(kind: CatalogKind, row: Row | null) {
    const d = getDescriptor(kind);
    // Re-filter on read even though saveConfig already filters on write: a stray/secret-shaped
    // key from a migration, manual DB edit, or future writer must never reach the response.
    const rawConfig = ((row?.metadata as Record<string, string> | null) ?? {}) as Record<string, string>;
    const allowed = new Set(configFieldKeys(kind));
    const config: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawConfig)) if (allowed.has(k)) config[k] = v;
    const redirect = redirectUrlFor(kind);
    const configOut = redirect ? { ...config, redirectUrl: redirect } : config;
    const secrets = decryptSecretBlob(row?.secretEncrypted ?? null);
    return {
      kind,
      name: d.name,
      status: row?.status ?? "NOT_CONFIGURED",
      configured: row?.configured ?? false,
      enabled: row?.enabled ?? true,
      lastHealthCheckAt: row?.lastHealthCheckAt?.toISOString() ?? null,
      lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
      lastErrorCode: row?.lastErrorCode ?? null,
      config: configOut,
      secretHints: secretHints(secrets),
      supportsSendTest: d.supportsSendTest,
      fields: d.fields,
    };
  }

  async function ensureRow(kind: CatalogKind): Promise<Row> {
    const name = getDescriptor(kind).name;
    const existing = await prisma.integrationConnection.findUnique({ where: { kind_name: { kind, name } } });
    if (existing) return existing as Row;
    return (await prisma.integrationConnection.create({
      data: { kind, name, status: "NOT_CONFIGURED", configured: false, enabled: true },
    })) as Row;
  }

  async function listCatalog() {
    const rows = await Promise.all(INTEGRATION_CATALOG.map((d) => ensureRow(d.kind)));
    return INTEGRATION_CATALOG.map((d, i) => toDto(d.kind, rows[i] ?? null));
  }
  async function getOne(kind: CatalogKind) {
    return toDto(kind, await ensureRow(kind));
  }

  async function saveConfig(kind: CatalogKind, input: { config: Record<string, string>; secrets: Record<string, string>; enabled?: boolean }) {
    const row = await ensureRow(kind);
    // Keep only known non-secret config keys; drop anything else (defence-in-depth,
    // no secret leaks into metadata).
    const allowed = configFieldKeys(kind);
    const prevConfig = (row.metadata as Record<string, string> | null) ?? {};
    const nextConfig: Record<string, string> = { ...prevConfig };
    for (const k of allowed) {
      const v = input.config[k];
      if (v != null) nextConfig[k] = v;
    }

    const allowedSecrets = secretFieldKeys(kind);
    const incomingSecrets: Record<string, string | undefined> = {};
    for (const k of allowedSecrets) if (k in input.secrets) incomingSecrets[k] = input.secrets[k];
    const mergedSecrets = mergeSecrets(decryptSecretBlob(row.secretEncrypted), incomingSecrets);

    const configured = Object.keys(mergedSecrets).length > 0 || row.configured;
    const enabled = input.enabled ?? row.enabled;
    const status = !enabled ? "DISABLED" : configured ? "CONFIGURED" : "NOT_CONFIGURED";

    const updated = (await prisma.integrationConnection.update({
      where: { id: row.id },
      data: {
        metadata: nextConfig as never,
        secretEncrypted: Object.keys(mergedSecrets).length ? encryptSecretBlob(mergedSecrets) : row.secretEncrypted,
        configured,
        enabled,
        status,
      },
    })) as Row;
    return toDto(kind, updated);
  }

  function resolved(row: Row): ResolvedConfig {
    return {
      config: ((row.metadata as Record<string, string> | null) ?? {}) as Record<string, string>,
      secrets: decryptSecretBlob(row.secretEncrypted),
    };
  }

  async function applyResult(row: Row, r: { ok: boolean; code?: string }) {
    const status = r.ok ? "HEALTHY" : row.configured ? "ERROR" : "NOT_CONFIGURED";
    await prisma.integrationConnection.update({
      where: { id: row.id },
      data: {
        status,
        lastHealthCheckAt: new Date(),
        lastErrorCode: r.ok ? null : (r.code ?? "PROVIDER_ERROR"),
        ...(r.ok ? { lastSuccessAt: new Date() } : {}),
      },
    });
    return { status: r.ok ? ("CONNECTED" as const) : ("FAILED" as const), code: r.ok ? null : (r.code ?? "PROVIDER_ERROR"), detail: null as string | null };
  }

  async function testConnection(kind: CatalogKind) {
    const row = await ensureRow(kind);
    let r: { ok: boolean; code?: string; detail?: string | null };
    try {
      r = await getAdapter(kind).testConnection(resolved(row));
    } catch {
      r = { ok: false, code: "PROVIDER_ERROR" }; // never log the error (no secret leak)
    }
    const out = await applyResult(row, r);
    return { ...out, detail: r.detail ?? null };
  }

  async function sendTest(kind: CatalogKind, target: { to: string; message?: string }) {
    const row = await ensureRow(kind);
    const adapter = getAdapter(kind);
    if (!adapter.sendTest) return { status: "FAILED" as const, code: "INVALID_CONFIG", detail: "send test not supported" };
    let r: { ok: boolean; code?: string; detail?: string | null };
    try {
      r = await adapter.sendTest(resolved(row), target);
    } catch {
      r = { ok: false, code: "PROVIDER_ERROR" }; // never log the error (no secret leak)
    }
    const out = await applyResult(row, r);
    return { ...out, detail: r.detail ?? null };
  }

  return { listCatalog, getOne, saveConfig, testConnection, sendTest };
}
