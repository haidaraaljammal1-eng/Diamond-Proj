import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { encryptSecret } from "src/lib/security/encryption";
import { integrationNotFoundError } from "src/modules/reports/reports.errors";
import type { UpsertIntegrationSchema } from "src/modules/reports/reports.schema";

/** Integration registry. Statuses are DERIVED from real config — never hardcoded
 *  "connected". Secrets are encrypted at rest, never returned or audited. */
export function createIntegrationsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  const toPublic = (i: { id: number; kind: string; name: string; status: string; configured: boolean; enabled: boolean; lastHealthCheckAt: Date | null; lastSuccessAt: Date | null; lastErrorCode: string | null; metadata: unknown }) =>
    ({ id: i.id, kind: i.kind, name: i.name, status: i.status, configured: i.configured, enabled: i.enabled, lastHealthCheckAt: i.lastHealthCheckAt, lastSuccessAt: i.lastSuccessAt, lastErrorCode: i.lastErrorCode, metadata: (i.metadata as Record<string, unknown> | null) ?? null });

  async function list() {
    const rows = await prisma.integrationConnection.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
    return rows.map(toPublic);
  }
  async function get(id: number) {
    const i = await prisma.integrationConnection.findUnique({ where: { id } });
    if (!i) throw integrationNotFoundError();
    return toPublic(i);
  }

  async function upsert(input: z.infer<typeof UpsertIntegrationSchema>) {
    const existing = await prisma.integrationConnection.findUnique({ where: { kind_name: { kind: input.kind, name: input.name } } });
    const configured = input.secret != null ? true : existing?.configured ?? false;
    const status = deriveStatus(input.kind, configured, input.enabled ?? existing?.enabled ?? true);
    const data = {
      status, configured, enabled: input.enabled ?? existing?.enabled ?? true,
      metadata: (input.metadata ?? existing?.metadata ?? undefined) as never,
      ...(input.secret != null ? { secretEncrypted: encryptSecret(input.secret) } : {}),
    };
    const row = existing
      ? await prisma.integrationConnection.update({ where: { id: existing.id }, data })
      : await prisma.integrationConnection.create({ data: { kind: input.kind, name: input.name, ...data } });
    return toPublic(row);
  }

  /** Honest health: EMAIL is derived from capability; others cannot be verified
   *  without a live adapter (stay CONFIGURED/NOT_CONFIGURED — never a fake HEALTHY). */
  async function healthCheck(id: number) {
    const i = await prisma.integrationConnection.findUnique({ where: { id } });
    if (!i) throw integrationNotFoundError();
    let status = i.status;
    if (i.kind === "EMAIL") status = fastify.capabilities.email ? "HEALTHY" : "NOT_CONFIGURED";
    else status = i.configured ? "CONFIGURED" : "NOT_CONFIGURED";
    const row = await prisma.integrationConnection.update({ where: { id }, data: { status, lastHealthCheckAt: new Date(), ...(status === "HEALTHY" ? { lastSuccessAt: new Date() } : {}) } });
    return toPublic(row);
  }

  function deriveStatus(kind: string, configured: boolean, enabled: boolean): "NOT_CONFIGURED" | "CONFIGURED" | "HEALTHY" | "DISABLED" {
    if (!enabled) return "DISABLED";
    if (!configured) return "NOT_CONFIGURED";
    if (kind === "EMAIL" && fastify.capabilities.email) return "HEALTHY";
    return "CONFIGURED";
  }

  return { list, get, upsert, healthCheck };
}
