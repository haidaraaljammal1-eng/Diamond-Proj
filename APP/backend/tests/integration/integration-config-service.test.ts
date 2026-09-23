import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createIntegrationConfigService } from "src/modules/integrations/integration-config.service";
import { INTEGRATION_CATALOG } from "src/modules/integrations/catalog";

/**
 * Integration-config service (catalog ensure / save / DTO / test-send orchestration).
 * Real Prisma against the test DB; only run when RUN_INTEGRATION=true with a
 * disposable test DATABASE_URL.
 *
 * The 5 catalog kind+name pairs are singleton rows the app's own seed script
 * (`prisma/seed/index.ts`) pre-populates as NOT_CONFIGURED — other integration
 * suites (e.g. reports.test.ts) depend on those rows existing. This suite
 * mutates them (it must, to exercise saveConfig/testConnection on real rows),
 * so `before` snapshots whatever was there first and `after` restores it
 * exactly — reverting on update, deleting only rows this suite itself created.
 * This guarantees no leftover enabled+configured EMAIL row survives to poison
 * resolveEmailTransport's DB-config-first lookup, while leaving the table
 * exactly as found for every other suite.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("integration-config-service integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", { skip: true }, () => {});
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let svc: ReturnType<typeof createIntegrationConfigService>;
  type ConnRow = Awaited<ReturnType<PrismaClient["integrationConnection"]["findUnique"]>>;
  const snapshots = new Map<string, ConnRow>();

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    svc = createIntegrationConfigService(app);
    for (const d of INTEGRATION_CATALOG) {
      snapshots.set(
        d.kind,
        await prisma.integrationConnection.findUnique({ where: { kind_name: { kind: d.kind, name: d.name } } }),
      );
    }
  });

  after(async () => {
    // Restore each of the 5 catalog rows to its pre-suite state (or delete it,
    // if this suite is what created it) — never leave a mutated row behind.
    for (const d of INTEGRATION_CATALOG) {
      const prior = snapshots.get(d.kind);
      if (prior) {
        await prisma.integrationConnection.update({
          where: { id: prior.id },
          data: {
            status: prior.status,
            configured: prior.configured,
            enabled: prior.enabled,
            metadata: prior.metadata as never,
            secretEncrypted: prior.secretEncrypted,
            lastHealthCheckAt: prior.lastHealthCheckAt,
            lastSuccessAt: prior.lastSuccessAt,
            lastErrorCode: prior.lastErrorCode,
          },
        });
      } else {
        await prisma.integrationConnection.deleteMany({ where: { kind: d.kind, name: d.name } });
      }
    }
    if (app) await app.close();
  });

  test("listCatalog returns exactly the managed integrations, creating missing rows as NOT_CONFIGURED", async () => {
    const list = await svc.listCatalog();
    assert.equal(list.length, INTEGRATION_CATALOG.length);
    const email = list.find((i) => i.kind === "EMAIL");
    assert.equal(email?.status, "NOT_CONFIGURED");
    assert.equal(email?.configured, false);
    assert.ok(Array.isArray(email?.fields) && email.fields.length > 0);
  });

  test("saveConfig stores non-secret config in metadata, encrypts secrets, returns masked hints, sets CONFIGURED", async () => {
    const dto = await svc.saveConfig("EMAIL", {
      config: { smtpHost: "smtp.test.io", smtpPort: "587", encryption: "starttls", fromEmail: "no-reply@test.io", username: "u" },
      secrets: { password: "supersecreta82f" },
    });
    assert.equal(dto.status, "CONFIGURED");
    assert.equal(dto.configured, true);
    assert.equal(dto.config.smtpHost, "smtp.test.io");
    assert.equal(dto.secretHints.password, "••••a82f");
    assert.equal((dto as Record<string, unknown>).secretEncrypted, undefined); // never leaks
    assert.equal((dto.config as Record<string, unknown>).password, undefined); // secret not in config
  });

  test("saveConfig with blank secret keeps the previous secret", async () => {
    await svc.saveConfig("EMAIL", { config: { smtpHost: "smtp.test.io", fromEmail: "a@test.io" }, secrets: { password: "keepme99" } });
    const dto = await svc.saveConfig("EMAIL", { config: { smtpHost: "smtp2.test.io", fromEmail: "a@test.io" }, secrets: { password: "" } });
    assert.equal(dto.secretHints.password, "••••me99"); // unchanged
  });

  test("testConnection on an unconfigured integration returns FAILED/NOT_CONFIGURED and leaves status NOT_CONFIGURED", async () => {
    const res = await svc.testConnection("POWER_BI");
    assert.equal(res.status, "FAILED");
    assert.equal(res.code, "NOT_CONFIGURED");
    const one = await svc.getOne("POWER_BI");
    assert.equal(one.status, "NOT_CONFIGURED");
  });
}
