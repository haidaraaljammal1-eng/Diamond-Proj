import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { PERMISSIONS } from "src/constants/permissions";
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
  test("functional RBAC V2 violations skipped (RUN_INTEGRATION=true)", { skip: true });
} else {
  describe("functional RBAC V2 violations / Salik HTTP boundaries", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `VLRBAC${Date.now().toString(36).toUpperCase()}`;
    const testDatabaseUrl = resolveTestDatabaseUrl();

    let viewToken = "";
    let manualToken = "";
    let noneToken = "";
    let legacyChargeToken = "";
    let liabilityId = "";

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
            category: key.startsWith("diamond.fn.") ? "functional_v2" : key.split(".")[0],
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
      process.env.LOG_LEVEL = "silent";

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;

      await seedUser(`vl-view-${run}@test.local`, "pass", `vl_view_${run}`, [
        PERMISSIONS.VIOLATIONS_READ,
        FN.violations.viewPage,
      ]);
      await seedUser(`vl-manual-${run}@test.local`, "pass", `vl_manual_${run}`, [
        PERMISSIONS.VIOLATIONS_READ,
        PERMISSIONS.VIOLATIONS_CHARGE,
        FN.violations.viewPage,
        FN.violations.manualCollection,
      ]);
      await seedUser(`vl-none-${run}@test.local`, "pass", `vl_none_${run}`, ["vehicles.read"]);
      await seedUser(`vl-legacy-${run}@test.local`, "pass", `vl_legacy_${run}`, [
        PERMISSIONS.VIOLATIONS_READ,
        PERMISSIONS.VIOLATIONS_CHARGE,
      ]);

      viewToken = await login(`vl-view-${run}@test.local`, "pass");
      manualToken = await login(`vl-manual-${run}@test.local`, "pass");
      noneToken = await login(`vl-none-${run}@test.local`, "pass");
      legacyChargeToken = await login(`vl-legacy-${run}@test.local`, "pass");

      const list = await app.inject({
        method: "GET",
        url: "/road-liabilities?page=1&pageSize=1",
        headers: auth(viewToken),
      });
      assert.equal(list.statusCode, 200, list.body);
      const items = list.json().data as { id: string }[];
      liabilityId = items[0]?.id ?? "";
    });

    after(async () => {
      await app.close();
    });

    test("view_page: read APIs succeed", async () => {
      for (const url of [
        "/road-liabilities/summary",
        "/road-liabilities?page=1&pageSize=5",
        "/road-liabilities/returned-contracts?page=1&pageSize=5",
      ]) {
        const res = await app.inject({ method: "GET", url, headers: auth(viewToken) });
        assert.equal(res.statusCode, 200, `${url} ${res.body}`);
      }
      if (liabilityId) {
        const detail = await app.inject({
          method: "GET",
          url: `/road-liabilities/${liabilityId}`,
          headers: auth(viewToken),
        });
        assert.equal(detail.statusCode, 200, detail.body);
        const charge = await app.inject({
          method: "GET",
          url: `/road-liabilities/${liabilityId}/customer-charge`,
          headers: auth(viewToken),
        });
        assert.ok([200, 404].includes(charge.statusCode), charge.body);
        const collection = await app.inject({
          method: "GET",
          url: `/road-liabilities/${liabilityId}/collection`,
          headers: auth(viewToken),
        });
        assert.ok([200, 404].includes(collection.statusCode), collection.body);
      }
    });

    test("view_page: collection mutations denied", async () => {
      if (!liabilityId) return;
      const fakeContract = "00000000-0000-4000-8000-000000000099";
      const cases = [
        {
          method: "POST" as const,
          url: `/road-liabilities/${liabilityId}/collection/off-session`,
          payload: {},
        },
        {
          method: "POST" as const,
          url: `/road-liabilities/returned-contracts/${fakeContract}/manual-charge`,
          payload: {
          chargeCategory: "SALIK",
          amountAed: 10,
          referenceNumber: "RBAC-DENY-1",
        },
        },
      ];
      for (const c of cases) {
        const res = await app.inject({
          method: c.method,
          url: c.url,
          headers: auth(viewToken),
          payload: c.payload,
        });
        assert.equal(res.statusCode, 403, `${c.url} ${res.body}`);
      }
    });

    test("manual_collection: unrelated traffic collection still denied", async () => {
      if (!liabilityId) return;
      const res = await app.inject({
        method: "POST",
        url: `/road-liabilities/${liabilityId}/collection/off-session`,
        headers: auth(manualToken),
        payload: {},
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("legacy violations.charge cannot bypass V2 on staff manual charge", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/road-liabilities/returned-contracts/00000000-0000-4000-8000-000000000088/manual-charge",
        headers: auth(legacyChargeToken),
        payload: {
          chargeCategory: "SALIK",
          amountAed: 10,
          referenceNumber: "RBAC-DENY-1",
        },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("no violations capability: direct API 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/road-liabilities?page=1&pageSize=1",
        headers: auth(noneToken),
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("view_page deny does not mutate on forbidden manual charge", async () => {
      const before = await prisma.roadLiabilityCustomerCharge.count();
      await app.inject({
        method: "POST",
        url: "/road-liabilities/returned-contracts/00000000-0000-4000-8000-000000000077/manual-charge",
        headers: auth(viewToken),
        payload: {
          chargeCategory: "SALIK",
          amountAed: 99,
          referenceNumber: "DENY-ZERO",
        },
      });
      const after = await prisma.roadLiabilityCustomerCharge.count();
      assert.equal(after, before);
    });
  });
}
