import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { INTEGRATION_CATALOG } from "src/modules/integrations/catalog";

/**
 * Admin HTTP routes for the dynamic integrations config system: GET catalog,
 * POST /:kind/config, POST /:kind/test-connection, POST /:kind/send-test.
 * Real Prisma against the test DB; only run when RUN_INTEGRATION=true with a
 * disposable test DATABASE_URL.
 *
 * Mirrors the harness in tests/integration/integration-config-service.test.ts:
 * this suite mutates the shared singleton IntegrationConnection rows (EMAIL,
 * POWER_BI), so `before` snapshots whatever was there first and `after`
 * restores it exactly — never leaving a mutated/enabled EMAIL row behind
 * that would poison resolveEmailTransport's DB-config-first lookup for
 * other suites.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("integration-config-routes integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", { skip: true }, () => {});
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  type ConnRow = Awaited<ReturnType<PrismaClient["integrationConnection"]["findUnique"]>>;
  const snapshots = new Map<string, ConnRow>();

  let managerT = "";
  let readerT = "";
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;

    for (const d of INTEGRATION_CATALOG) {
      snapshots.set(
        d.kind,
        await prisma.integrationConnection.findUnique({ where: { kind_name: { kind: d.kind, name: d.name } } }),
      );
    }

    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const tokenFor = (userId: number) => app.jwt.sign({ sub: userId, type: "access" });

    async function seedUser(email: string, roleKey: string, perms: string[]) {
      const canonicalEmail = normalizeEmail(email);
      const role = await prisma.role.upsert({ where: { key: roleKey }, update: {}, create: { key: roleKey, name: roleKey } });
      for (const key of perms) {
        const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, category: key.split(".")[0], description: key } });
        await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, update: {}, create: { roleId: role.id, permissionId: perm.id } });
      }
      const passwordHash = await hashPassword("int-pass-1234567");
      const user = await prisma.user.upsert({
        where: { email: canonicalEmail },
        update: { status: "ACTIVE", passwordHash },
        create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
      });
      await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
      return user.id;
    }

    // Manager: integrations.read + integrations.manage (full access).
    const managerId = await seedUser(`int-manager-${run}@ex.test`, `int_manager_${run}`, ["integrations.read", "integrations.manage"]);
    // Reader: integrations.read only — must be refused on any mutating route.
    const readerId = await seedUser(`int-reader-${run}@ex.test`, `int_reader_${run}`, ["integrations.read"]);
    managerT = tokenFor(managerId);
    readerT = tokenFor(readerId);
  });

  after(async () => {
    // Restore each of the 5 catalog rows to its pre-suite state (or delete
    // it, if this suite is what created it) — never leave a mutated row.
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

  test("GET /integrations returns the managed catalog with fields + secretHints, no secretEncrypted", async () => {
    const res = await app.inject({ method: "GET", url: "/integrations", headers: auth(managerT) });
    assert.equal(res.statusCode, 200);
    const data = res.json().data as { fields: unknown[] }[];
    assert.equal(data.length, INTEGRATION_CATALOG.length);
    assert.equal(res.payload.includes("secretEncrypted"), false);
    assert.ok(data.every((d) => Array.isArray(d.fields)));
  });

  test("POST /integrations/EMAIL/config never echoes the secret back", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/integrations/EMAIL/config",
      headers: auth(managerT),
      payload: { config: { smtpHost: "smtp.test.io", fromEmail: "a@test.io", encryption: "starttls", smtpPort: "587" }, secrets: { password: "topsecret1234" } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.includes("topsecret1234"), false);
    assert.equal(res.json().data.secretHints.password, "••••1234");
  });

  test("POST /integrations/POWER_BI/test-connection with no creds -> FAILED/NOT_CONFIGURED", async () => {
    const res = await app.inject({ method: "POST", url: "/integrations/POWER_BI/test-connection", headers: auth(managerT), payload: {} });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.status, "FAILED");
    assert.equal(res.json().data.code, "NOT_CONFIGURED");
  });

  test("read-only user cannot POST config (403)", async () => {
    const res = await app.inject({ method: "POST", url: "/integrations/EMAIL/config", headers: auth(readerT), payload: { config: {}, secrets: {} } });
    assert.equal(res.statusCode, 403);
  });

  test("pre-existing non-catalog CRM rows do not replace the managed CRM catalog entry", async () => {
    await prisma.integrationConnection.create({
      data: { kind: "CRM", name: "Legacy CRM", status: "CONFIGURED", configured: true, enabled: true },
    });
    try {
      const res = await app.inject({ method: "GET", url: "/integrations", headers: auth(managerT) });
      assert.equal(res.statusCode, 200);
      const data = res.json().data as { kind: string; name: string }[];
      assert.equal(data.length, INTEGRATION_CATALOG.length);
      const managedCrm = data.find((row) => row.kind === "CRM");
      assert.equal(managedCrm?.name, "CRM");
      assert.equal(data.some((row) => row.name === "Legacy CRM"), false);
    } finally {
      await prisma.integrationConnection.deleteMany({ where: { kind: "CRM", name: "Legacy CRM" } });
    }
  });
}
