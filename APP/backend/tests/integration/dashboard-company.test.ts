import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * Dashboard row-level operating company (Phase B3).
 *
 * Row-level company identity. Page scope (`?companyId=`) is covered by
 * `dashboard-company-scope.test.ts`. An omitted filter remains the whole-business view.
 *
 * Requires RUN_INTEGRATION=true against the disposable haidara_test database.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("dashboard company integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  describe("dashboard operating company", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let token = "";
    let adminUserId = 0;
    let customerId = 0;
    let uniqueCompanyId = 0;
    let eliteCompanyId = 0;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `dash-admin-${run}@example.test`, password: "dash-admin-pass-123" };
    const auth = () => ({ authorization: `Bearer ${token}` });

    const PERMS = [
      "dashboard.read",
      "contracts.read",
      "vehicles.read",
      "vehicles.manage",
      "finance.read",
      "gps.read",
    ];

    async function seedUser() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const role = await prisma.role.upsert({
        where: { key: `dash_admin_${run}` },
        update: {},
        create: { key: `dash_admin_${run}`, name: `dash_admin_${run}` },
      });
      for (const key of PERMS) {
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
      const user = await prisma.user.create({
        data: {
          email: normalizeEmail(admin.email),
          name: `Dash Admin ${run}`,
          passwordHash: await hashPassword(admin.password),
          status: "ACTIVE",
        },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      return user.id;
    }

    async function createVehicle(companyId: number, suffix: string) {
      const res = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId,
          vehicleName: `Dash ${suffix} ${run}`,
          plateNumber: `DSH ${run} ${suffix}`,
        },
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().data.id as number;
    }

    /** A contract delivering today, written straight to the table for determinism. */
    async function createContract(input: {
      number: string;
      companyId: number;
      vehicleId: number;
      startAt: Date;
    }) {
      return prisma.contract.create({
        data: {
          contractNumber: input.number,
          companyId: input.companyId,
          vehicleId: input.vehicleId,
          customerId,
          createdByUserId: adminUserId,
          status: "PAID",
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 400,
          startAt: input.startAt,
        },
        select: { id: true },
      });
    }

    async function overview() {
      const res = await app.inject({
        method: "GET",
        url: "/dashboard/overview",
        headers: auth(),
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data as {
        kpis: Record<string, number | null>;
        weeklyFinance: unknown;
        fleetStatus: unknown;
        todayDeliveries: Array<{
          contractNumber: string;
          company: { code: string; displayName: string; accentColor: string };
        }> | null;
        recentContracts: Array<{
          contractNumber: string;
          company: { code: string; displayName: string; accentColor: string };
        }> | null;
      };
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error(
          "dashboard company integration refuses to run unless DATABASE_URL is haidara_test",
        );
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedUser();
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(login.statusCode, 200, login.body);
      token = login.json().data.accessToken as string;

      uniqueCompanyId = await testCompanyId(prisma, "UNIQUE");
      eliteCompanyId = await testCompanyId(prisma, "ELITE");
      customerId = (await prisma.customer.create({ data: { name: `Dash Customer ${run}` } })).id;

      // Midday "today" in business time keeps the row inside the business day for any
      // sane BUSINESS_TIMEZONE_OFFSET_MINUTES.
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);

      await createContract({
        number: `DSH-U-${run}`,
        companyId: uniqueCompanyId,
        vehicleId: await createVehicle(uniqueCompanyId, "U"),
        startAt: today,
      });
      await createContract({
        number: `DSH-E-${run}`,
        companyId: eliteCompanyId,
        vehicleId: await createVehicle(eliteCompanyId, "E"),
        startAt: today,
      });
    });

    after(async () => {
      if (app) await app.close();
    });

    test("today deliveries carry the Contract company", async () => {
      const data = await overview();
      assert.ok(data.todayDeliveries, "todayDeliveries was not readable");
      const unique = data.todayDeliveries!.find((row) => row.contractNumber === `DSH-U-${run}`);
      const elite = data.todayDeliveries!.find((row) => row.contractNumber === `DSH-E-${run}`);
      assert.ok(unique, "the UNIQUE delivery is missing from today");
      assert.ok(elite, "the ELITE delivery is missing from today");
      assert.equal(unique!.company.code, "UNIQUE");
      assert.equal(elite!.company.code, "ELITE");
      // The marker renders from backend identity, not a hardcoded company table.
      assert.ok(elite!.company.displayName.length > 0);
      assert.ok(elite!.company.accentColor.startsWith("#"));
    });

    test("recent contracts carry the Contract company", async () => {
      const data = await overview();
      assert.ok(data.recentContracts, "recentContracts was not readable");
      const unique = data.recentContracts!.find((row) => row.contractNumber === `DSH-U-${run}`);
      const elite = data.recentContracts!.find((row) => row.contractNumber === `DSH-E-${run}`);
      assert.ok(unique && elite, "the seeded contracts are not in the recent list");
      assert.equal(unique!.company.code, "UNIQUE");
      assert.equal(elite!.company.code, "ELITE");
    });

    test("the company is the Contract's own, not the Vehicle's current one", async () => {
      // Contract.companyId is frozen history. Diamond cannot move a Vehicle between
      // companies, so this row is built directly and only proves the read path takes
      // the Contract, never the Vehicle.
      const uniqueVehicleId = await createVehicle(uniqueCompanyId, "X");
      await createContract({
        number: `DSH-X-${run}`,
        companyId: eliteCompanyId,
        vehicleId: uniqueVehicleId,
        startAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
      const data = await overview();
      const crossed = data.recentContracts!.find((row) => row.contractNumber === `DSH-X-${run}`);
      assert.ok(crossed, "the crossed contract is missing from the recent list");
      assert.equal(crossed!.company.code, "ELITE");
    });

    test("an omitted company filter still returns both companies together", async () => {
      const plain = await overview();
      const numbers = plain.todayDeliveries?.map((row) => row.contractNumber) ?? [];
      assert.ok(numbers.includes(`DSH-U-${run}`));
      assert.ok(numbers.includes(`DSH-E-${run}`));
      assert.ok((plain.kpis.fleetTotal ?? 0) >= 2);
    });
  });
}
