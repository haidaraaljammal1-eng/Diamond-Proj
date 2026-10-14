import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../helpers/integration-harness";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function resolveTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL ?? "";
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  const testUrl = explicit || devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(testUrl);
  return testUrl;
}

const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("session revocation skipped (RUN_INTEGRATION=true)", { skip: true });
} else {
  describe("functional RBAC V2 live session revocation (HTTP)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `REV${Date.now().toString(36).toUpperCase()}`;
    const testDatabaseUrl = resolveTestDatabaseUrl();

    let adminToken = "";
    let employeeToken = "";
    let roleId = 0;
    let vehicleId = 0;

    async function seedUser(
      email: string,
      password: string,
      roleKey: string,
      permissionKeys: string[],
    ) {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const canonicalEmail = normalizeEmail(email);
      const role = await prisma.role.upsert({
        where: { key: roleKey },
        update: {},
        create: { key: roleKey, name: roleKey },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const key of permissionKeys) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: "functional_v2", description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const passwordHash = await hashPassword(password);
      await prisma.user.upsert({
        where: { email: canonicalEmail },
        update: { status: "ACTIVE", passwordHash },
        create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      return { userId: user.id, roleId: role.id };
    }

    async function login(email: string, password: string) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data.accessToken as string;
    }

    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

    before(async () => {
      assert.equal(extractPostgresDatabaseName(testDatabaseUrl), "haidara_test");
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.RATE_LIMIT_AUTH_MAX = "1000";
      process.env.LOG_LEVEL = "silent";

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;

      const employeeRoleKey = `emp_rev_${run}`;
      const seeded = await seedUser(`emp-${run}@example.test`, "pass-emp", employeeRoleKey, [
        FN.vehicles.viewPage,
        FN.vehicles.editPrices,
      ]);
      roleId = seeded.roleId;

      await seedUser(`adm-${run}@example.test`, "pass-adm", `adm_rev_${run}`, [
        FN.roles.viewPage,
        FN.roles.managePermissions,
        FN.vehicles.viewPage,
        FN.vehicles.editPrices,
        FN.vehicles.addDelete,
      ]);

      employeeToken = await login(`emp-${run}@example.test`, "pass-emp");
      adminToken = await login(`adm-${run}@example.test`, "pass-adm");

      const cid = await testCompanyId(prisma);
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(adminToken),
        payload: {
          companyId: cid,
          vehicleName: `Revoke ${run}`,
          plateNumber: `RV ${run}`.slice(0, 16),
          dailyRate: 100,
          monthlyRate: 2000,
        },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      vehicleId = vehicleRes.json().data.id as number;
    });

    after(async () => {
      delete process.env.FUNCTIONAL_RBAC_V2_ENABLED;
      await app.close();
      await prisma.$disconnect();
    });

    test("backend denies price edit immediately after grant revocation (same JWT)", async () => {
      const before = await app.inject({
        method: "PUT",
        url: `/vehicles/${vehicleId}`,
        headers: auth(employeeToken),
        payload: { dailyRate: 150 },
      });
      assert.equal(before.statusCode, 200, before.body);

      const roleRow = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
      const revoke = await app.inject({
        method: "PUT",
        url: `/roles/${roleId}/functional-grants`,
        headers: auth(adminToken),
        payload: {
          functionalGrants: [FN.vehicles.viewPage],
          ifMatchUpdatedAt: roleRow.updatedAt.toISOString(),
        },
      });
      assert.equal(revoke.statusCode, 200, revoke.body);

      const after = await app.inject({
        method: "PUT",
        url: `/vehicles/${vehicleId}`,
        headers: auth(employeeToken),
        payload: { dailyRate: 175 },
      });
      assert.equal(after.statusCode, 403, after.body);

      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: auth(employeeToken),
      });
      assert.equal(me.statusCode, 200, me.body);
      const perms = me.json().data.permissions as string[];
      assert.ok(!perms.includes(FN.vehicles.editPrices), me.body);

      const roleRow2 = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
      const restore = await app.inject({
        method: "PUT",
        url: `/roles/${roleId}/functional-grants`,
        headers: auth(adminToken),
        payload: {
          functionalGrants: [FN.vehicles.viewPage, FN.vehicles.editPrices],
          ifMatchUpdatedAt: roleRow2.updatedAt.toISOString(),
        },
      });
      assert.equal(restore.statusCode, 200, restore.body);

      const recovered = await app.inject({
        method: "PUT",
        url: `/vehicles/${vehicleId}`,
        headers: auth(employeeToken),
        payload: { dailyRate: 180 },
      });
      assert.equal(recovered.statusCode, 200, recovered.body);
    });
  });
}
