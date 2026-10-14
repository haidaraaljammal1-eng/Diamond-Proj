import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { ALL_FUNCTIONAL_CAPABILITY_KEYS, FN } from "src/lib/rbac/functional-permissions/keys";
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
  test(
    "functional RBAC V2 integration skipped (RUN_INTEGRATION=true)",
    { skip: true },
  );
} else {
  describe("functional RBAC V2 HTTP enforcement", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const testDatabaseUrl = resolveTestDatabaseUrl();
    let v2OffToken = "";
    let priceEditorToken = "";
    let fleetCreatorToken = "";
    let invoiceViewerToken = "";
    let roleManagerToken = "";
    let maintCreateToken = "";
    let maintLifecycleToken = "";
    let financeAddToken = "";
    let financeViewToken = "";
    let vehicleViewOnlyToken = "";
    let contractViewOnlyToken = "";
    let gpsFullToken = "";
    let archiveFullToken = "";
    let whatsappFullToken = "";
    let adminToken = "";
    let vehicleId = 0;
    let companyId = 0;
    let maintenanceOrderId = 0;

    async function ensureCatalogKeys() {
      for (const key of ALL_FUNCTIONAL_CAPABILITY_KEYS) {
        await prisma.permission.upsert({
          where: { key },
          update: {},
          create: {
            key,
            category: "functional_v2",
            description: key,
          },
        });
      }
    }

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
          create: { key, category: key.split(".")[0], description: key },
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

    function auth(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    before(async () => {
      assert.equal(extractPostgresDatabaseName(testDatabaseUrl), "haidara_test");

      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.RATE_LIMIT_AUTH_MAX = "1000";
      process.env.LOG_LEVEL = "silent";

      const { env } = await import("src/config/env");
      assert.match(env.DATABASE_URL, /haidara_test(?:\?|$)/);

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await ensureCatalogKeys();

      await seedUser(
        `rbac-v2-off-${run}@example.test`,
        "pass-v2-off",
        `rbac_v2_off_${run}`,
        ["vehicles.read", "vehicles.manage"],
      );
      await seedUser(
        `rbac-price-${run}@example.test`,
        "pass-price",
        `rbac_price_${run}`,
        [FN.vehicles.viewPage, FN.vehicles.editPrices],
      );
      await seedUser(
        `rbac-fleet-${run}@example.test`,
        "pass-fleet",
        `rbac_fleet_${run}`,
        [FN.vehicles.viewPage, FN.vehicles.addDelete, "reference_data.lookup"],
      );
      await seedUser(
        `rbac-inv-${run}@example.test`,
        "pass-inv",
        `rbac_inv_${run}`,
        [FN.invoices.viewPage],
      );
      await seedUser(
        `rbac-role-mgr-${run}@example.test`,
        "pass-rolemgr",
        `rbac_role_mgr_${run}`,
        [FN.roles.viewPage, FN.roles.managePermissions, FN.finance.viewPage],
      );
      await seedUser(
        `rbac-maint-create-${run}@example.test`,
        "pass-mc",
        `rbac_mc_${run}`,
        [FN.maintenance.create, FN.maintenance.viewPage, "reference_data.lookup"],
      );
      await seedUser(
        `rbac-maint-life-${run}@example.test`,
        "pass-ml",
        `rbac_ml_${run}`,
        [FN.maintenance.manageLifecycle, FN.maintenance.viewPage],
      );
      await seedUser(
        `rbac-fin-add-${run}@example.test`,
        "pass-fa",
        `rbac_fa_${run}`,
        [FN.finance.addExpense, FN.finance.viewPage],
      );
      await seedUser(
        `rbac-fin-view-${run}@example.test`,
        "pass-fv",
        `rbac_fv_${run}`,
        [FN.finance.viewPage],
      );
      await seedUser(
        `rbac-veh-view-${run}@example.test`,
        "pass-vv",
        `rbac_vv_${run}`,
        [FN.vehicles.viewPage],
      );
      await seedUser(
        `rbac-contract-view-${run}@example.test`,
        "pass-cv",
        `rbac_cv_${run}`,
        [FN.contracts.viewPage],
      );
      await seedUser(
        `rbac-gps-${run}@example.test`,
        "pass-gps",
        `rbac_gps_${run}`,
        [FN.gps.full],
      );
      await seedUser(
        `rbac-archive-${run}@example.test`,
        "pass-arch",
        `rbac_arch_${run}`,
        [FN.archive.full],
      );
      await seedUser(
        `rbac-wa-${run}@example.test`,
        "pass-wa",
        `rbac_wa_${run}`,
        [FN.whatsapp.full],
      );

      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
      v2OffToken = await login(`rbac-v2-off-${run}@example.test`, "pass-v2-off");
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";

      priceEditorToken = await login(`rbac-price-${run}@example.test`, "pass-price");
      fleetCreatorToken = await login(`rbac-fleet-${run}@example.test`, "pass-fleet");
      invoiceViewerToken = await login(`rbac-inv-${run}@example.test`, "pass-inv");
      roleManagerToken = await login(`rbac-role-mgr-${run}@example.test`, "pass-rolemgr");
      maintCreateToken = await login(`rbac-maint-create-${run}@example.test`, "pass-mc");
      maintLifecycleToken = await login(`rbac-maint-life-${run}@example.test`, "pass-ml");
      financeAddToken = await login(`rbac-fin-add-${run}@example.test`, "pass-fa");
      financeViewToken = await login(`rbac-fin-view-${run}@example.test`, "pass-fv");
      vehicleViewOnlyToken = await login(`rbac-veh-view-${run}@example.test`, "pass-vv");
      contractViewOnlyToken = await login(
        `rbac-contract-view-${run}@example.test`,
        "pass-cv",
      );
      gpsFullToken = await login(`rbac-gps-${run}@example.test`, "pass-gps");
      archiveFullToken = await login(`rbac-archive-${run}@example.test`, "pass-arch");
      whatsappFullToken = await login(`rbac-wa-${run}@example.test`, "pass-wa");

      const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!";
      try {
        adminToken = await login("admin@diamond.test", adminPassword);
      } catch {
        adminToken = "";
      }

      const list = await app.inject({
        method: "GET",
        url: "/vehicles?page=1&pageSize=1",
        headers: auth(fleetCreatorToken),
      });
      assert.equal(list.statusCode, 200, list.body);
      vehicleId = list.json().data?.[0]?.id ?? 0;
      companyId = await testCompanyId(prisma);
    });

    after(async () => {
      delete process.env.FUNCTIONAL_RBAC_V2_ENABLED;
      await app.close();
      await prisma.$disconnect();
    });

    test("V2 disabled: legacy vehicles.manage can list vehicles", async () => {
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
      const res = await app.inject({
        method: "GET",
        url: "/vehicles?page=1&pageSize=1",
        headers: auth(v2OffToken),
      });
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
      assert.equal(res.statusCode, 200, res.body);
    });

    test("V2 enabled: parent-only vehicle view cannot create", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(vehicleViewOnlyToken),
        payload: {
          companyId,
          vehicleName: "RBAC Test Car",
          plateNumber: `RBAC-${run}`,
          dailyRate: 100,
          monthlyRate: 2000,
        },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: price editor cannot deactivate vehicle", async () => {
      if (!vehicleId) return;
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/deactivate`,
        headers: auth(priceEditorToken),
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: fleet creator cannot edit prices without edit_prices", async () => {
      if (!vehicleId) return;
      const res = await app.inject({
        method: "PUT",
        url: `/vehicles/${vehicleId}`,
        headers: auth(fleetCreatorToken),
        payload: { dailyRate: 999 },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: fleet creator cannot mutate identity on update", async () => {
      if (!vehicleId) return;
      const res = await app.inject({
        method: "PUT",
        url: `/vehicles/${vehicleId}`,
        headers: auth(fleetCreatorToken),
        payload: { plateNumber: "HACK-999" },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: maintenance creator cannot complete without lifecycle", async () => {
      const orders = await app.inject({
        method: "GET",
        url: "/maintenance?page=1&pageSize=1",
        headers: auth(maintLifecycleToken),
      });
      assert.equal(orders.statusCode, 200, orders.body);
      maintenanceOrderId = orders.json().data?.[0]?.id ?? 0;
      if (!maintenanceOrderId) return;
      const complete = await app.inject({
        method: "POST",
        url: `/maintenance/${maintenanceOrderId}/complete`,
        headers: auth(maintCreateToken),
      });
      assert.equal(complete.statusCode, 403, complete.body);
    });

    test("V2 enabled: lifecycle manager cannot create order", async () => {
      if (!vehicleId) return;
      const res = await app.inject({
        method: "POST",
        url: "/maintenance",
        headers: auth(maintLifecycleToken),
        payload: {
          vehicleId,
          issueDescription: `RBAC denied ${run}`,
          maintenanceType: "other",
          startMode: "now",
        },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: finance viewer cannot add expense", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/finance/expenses",
        headers: auth(financeViewToken),
        payload: {
          amount: 25,
          category: "OTHER",
          recognizedAt: "2026-09-01T10:00:00.000Z",
          description: "denied",
        },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: finance add cannot void without void capability", async () => {
      const create = await app.inject({
        method: "POST",
        url: "/finance/expenses",
        headers: auth(financeAddToken),
        payload: {
          amount: 30,
          category: "OTHER",
          recognizedAt: "2026-09-01T10:00:00.000Z",
          description: "rbac expense",
        },
      });
      assert.ok(create.statusCode === 201 || create.statusCode === 200, create.body);
      const expenseId = create.json().data.id as string;
      const voidRes = await app.inject({
        method: "POST",
        url: `/finance/expenses/${expenseId}/void`,
        headers: auth(financeAddToken),
        payload: { voidReason: "should fail rbac void" },
      });
      assert.equal(voidRes.statusCode, 403, voidRes.body);
    });

    test("V2 enabled: invoice viewer cannot download PDF", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/invoices/00000000-0000-4000-8000-000000000001/pdf",
        headers: auth(invoiceViewerToken),
      });
      assert.ok(res.statusCode === 403 || res.statusCode === 404, res.body);
    });

    test("V2 enabled: cannot delegate finance.add_expense without holding it", async () => {
      const custom = await prisma.role.create({
        data: { key: `rbac_target_${run}`, name: "target" },
      });
      const res = await app.inject({
        method: "PUT",
        url: `/roles/${custom.id}/functional-grants`,
        headers: auth(roleManagerToken),
        payload: { functionalGrants: [FN.finance.addExpense] },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: legacy setRolePermissions cannot inject functional keys", async () => {
      const custom = await prisma.role.create({
        data: { key: `rbac_legacy_${run}`, name: "legacy target" },
      });
      const res = await app.inject({
        method: "PUT",
        url: `/roles/${custom.id}/permissions`,
        headers: auth(roleManagerToken),
        payload: { permissionKeys: [FN.vehicles.addDelete] },
      });
      assert.ok(res.statusCode === 400 || res.statusCode === 422, res.body);
    });

    test("V2 enabled: lookup users denied without legacy or functional access", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/lookups/users?page=1&pageSize=5",
        headers: auth(vehicleViewOnlyToken),
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: maintenance create may use vehicle lookup", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/lookups/vehicles?page=1&pageSize=5",
        headers: auth(maintCreateToken),
      });
      assert.equal(res.statusCode, 200, res.body);
    });

    test("V2 enabled: non-admin cannot reset user password", async () => {
      const target = await prisma.user.findFirst({
        where: { email: { contains: "rbac-v2-off" } },
        select: { id: true },
      });
      if (!target) return;
      const res = await app.inject({
        method: "POST",
        url: `/users/${target.id}/reset-password`,
        headers: auth(roleManagerToken),
        payload: { newPassword: "NewPass-123!", confirmPassword: "NewPass-123!" },
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: system admin can list roles", async () => {
      if (!adminToken) return;
      const res = await app.inject({
        method: "GET",
        url: "/roles?page=1&pageSize=5",
        headers: auth(adminToken),
      });
      assert.equal(res.statusCode, 200, res.body);
    });

    test("V2 enabled: contract view only cannot create rental offer", async () => {
      if (!vehicleId) return;
      const res = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(contractViewOnlyToken),
        payload: {
          vehicleId,
          companyId,
          dailyRate: 100,
          monthlyRate: 2000,
          durationDays: 3,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.ok(res.statusCode === 403 || res.statusCode === 422, res.body);
    });

    test("V2 enabled: contract view only cannot renew", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/contracts/00000000-0000-4000-8000-000000000001/renew",
        headers: auth(contractViewOnlyToken),
        payload: { additionalDays: 1, additionalAmount: 100 },
      });
      assert.ok(res.statusCode === 403 || res.statusCode === 404, res.body);
    });

    test("V2 enabled: vehicle view cannot access GPS list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/gps/vehicles?page=1&pageSize=1",
        headers: auth(vehicleViewOnlyToken),
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: GPS full can list GPS vehicles", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/gps/vehicles?page=1&pageSize=1",
        headers: auth(gpsFullToken),
      });
      assert.equal(res.statusCode, 200, res.body);
    });

    test("V2 enabled: archive full can list archive vehicles", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/archive/vehicles",
        headers: auth(archiveFullToken),
      });
      assert.equal(res.statusCode, 200, res.body);
    });

    test("V2 enabled: vehicle view cannot list archive", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/archive/vehicles",
        headers: auth(vehicleViewOnlyToken),
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: WhatsApp full can list conversations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations?page=1&pageSize=1",
        headers: auth(whatsappFullToken),
      });
      assert.equal(res.statusCode, 200, res.body);
    });

    test("V2 enabled: vehicle view cannot list WhatsApp conversations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/whatsapp/conversations?page=1&pageSize=1",
        headers: auth(vehicleViewOnlyToken),
      });
      assert.equal(res.statusCode, 403, res.body);
    });

    test("V2 enabled: stale ifMatchUpdatedAt rejects functional grant write", async () => {
      const custom = await prisma.role.create({
        data: { key: `rbac_cc_${run}`, name: "concurrency target" },
      });
      const roleRow = await prisma.role.findUniqueOrThrow({ where: { id: custom.id } });
      const stale = new Date(roleRow.updatedAt.getTime() - 60_000).toISOString();
      const res = await app.inject({
        method: "PUT",
        url: `/roles/${custom.id}/functional-grants`,
        headers: auth(roleManagerToken),
        payload: {
          functionalGrants: [FN.finance.viewPage],
          ifMatchUpdatedAt: stale,
        },
      });
      assert.equal(res.statusCode, 409, res.body);
      assert.equal(res.json().error?.code, "RESOURCE_MODIFIED");
    });

    test("V2 enabled: legacy vehicles.manage alone denied for create when V2 on", async () => {
      const legacyUser = `rbac-legacy-only-${run}@example.test`;
      await seedUser(legacyUser, "pass-legacy", `rbac_lo_${run}`, ["vehicles.manage"]);
      const token = await login(legacyUser, "pass-legacy");
      const res = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(token),
        payload: {
          companyId,
          vehicleName: "Legacy bypass",
          plateNumber: `LEG-${run}`,
          dailyRate: 50,
          monthlyRate: 1000,
        },
      });
      assert.equal(res.statusCode, 403, res.body);
    });
  });
}
