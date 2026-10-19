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
  test("functional RBAC V2 users skipped (RUN_INTEGRATION=true)", { skip: true });
} else {
  describe("functional RBAC V2 users edit + role assignment", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `USRBAC${Date.now().toString(36).toUpperCase()}`;
    const testDatabaseUrl = resolveTestDatabaseUrl();

    let viewToken = "";
    let editToken = "";
    let targetUserId = 0;
    let assignableRoleId = 0;

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
          create: {
            key,
            category: key.startsWith("diamond.fn.") ? "functional_v2" : "users",
            description: key,
          },
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
      return user.id;
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

      const pickerRole = await prisma.role.create({
        data: { key: `picker_${run}`, name: `picker_${run}` },
      });
      assignableRoleId = pickerRole.id;

      targetUserId = await seedUser(
        `target-${run}@example.test`,
        "pass-target",
        `target_${run}`,
        [FN.users.viewPage],
      );

      await seedUser(`uv-${run}@example.test`, "pass-uv", `uv_${run}`, [
        FN.users.viewPage,
      ]);
      await seedUser(`ue-${run}@example.test`, "pass-ue", `ue_${run}`, [
        FN.users.viewPage,
        FN.users.edit,
      ]);

      viewToken = await login(`uv-${run}@example.test`, "pass-uv");
      editToken = await login(`ue-${run}@example.test`, "pass-ue");
    });

    after(async () => {
      delete process.env.FUNCTIONAL_RBAC_V2_ENABLED;
      await app.close();
      await prisma.$disconnect();
    });

    test("view_page only cannot update user or set roles", async () => {
      const update = await app.inject({
        method: "PUT",
        url: `/users/${targetUserId}`,
        headers: auth(viewToken),
        payload: { name: "Blocked" },
      });
      assert.equal(update.statusCode, 403, update.body);
      const roles = await app.inject({
        method: "PUT",
        url: `/users/${targetUserId}/roles`,
        headers: auth(viewToken),
        payload: { roleIds: [assignableRoleId] },
      });
      assert.equal(roles.statusCode, 403, roles.body);
    });

    test("users.edit can update profile, lookup roles, and set roles", async () => {
      const lookup = await app.inject({
        method: "GET",
        url: "/lookups/roles",
        headers: auth(editToken),
      });
      assert.equal(lookup.statusCode, 200, lookup.body);
      const update = await app.inject({
        method: "PUT",
        url: `/users/${targetUserId}`,
        headers: auth(editToken),
        payload: { name: `Edited ${run}` },
      });
      assert.equal(update.statusCode, 200, update.body);
      const setRoles = await app.inject({
        method: "PUT",
        url: `/users/${targetUserId}/roles`,
        headers: auth(editToken),
        payload: { roleIds: [assignableRoleId] },
      });
      assert.equal(setRoles.statusCode, 200, setRoles.body);
    });

    test("users.edit cannot access roles administration", async () => {
      const list = await app.inject({
        method: "GET",
        url: "/roles",
        headers: auth(editToken),
      });
      assert.equal(list.statusCode, 403, list.body);
      const create = await app.inject({
        method: "POST",
        url: "/roles",
        headers: auth(editToken),
        payload: { name: `New ${run}`, key: `new_role_${run.toLowerCase()}` },
      });
      assert.equal(create.statusCode, 403, create.body);
    });
  });
}
