import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * Dashboard company scope (Phase C2).
 *
 * `?companyId=` filters every company-sensitive section. Omitting it is All
 * Companies, and weekly finance ALL still includes GENERAL (`companyId` null).
 * `companyScope=GENERAL` is rejected — GENERAL is not a dashboard company.
 *
 * Requires RUN_INTEGRATION=true against the disposable haidara_test database.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("dashboard company scope integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  describe("dashboard company scope", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let token = "";
    let adminUserId = 0;
    let customerId = 0;
    let uniqueCompanyId = 0;
    let eliteCompanyId = 0;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `dash-scope-${run}@example.test`, password: "dash-scope-pass-123" };
    const auth = () => ({ authorization: `Bearer ${token}` });

    const PERMS = [
      "dashboard.read",
      "contracts.read",
      "vehicles.read",
      "vehicles.manage",
      "finance.read",
      "gps.read",
    ];

    interface Overview {
      range: { from: string; to: string };
      kpis: {
        activeRentals: number | null;
        fleetTotal: number | null;
        fleetAvailable: number | null;
        contractsTotal: number | null;
        deliveriesToday: number | null;
        pendingLinks: number | null;
        readyForDelivery: number | null;
      };
      fleetStatus: { total: number; available: number; rented: number; service: number } | null;
      weeklyFinance: { collected: number; expenses: number; netMovement: number } | null;
      weeklyRentalActivity: Array<{ rented: number; returned: number }> | null;
      todayDeliveries: Array<{ contractNumber: string; company: { code: string } }> | null;
      recentContracts: Array<{ contractNumber: string; company: { code: string } }> | null;
    }

    async function seedUser() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const role = await prisma.role.upsert({
        where: { key: `dash_scope_${run}` },
        update: {},
        create: { key: `dash_scope_${run}`, name: `dash_scope_${run}` },
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
          name: `Dash Scope ${run}`,
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
          vehicleName: `Scope ${suffix} ${run}`,
          plateNumber: `SCP ${run} ${suffix}`,
        },
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().data.id as number;
    }

    async function createContract(input: {
      number: string;
      companyId: number;
      vehicleId: number;
      status: "PAID" | "ACTIVE";
      startAt: Date;
    }) {
      return prisma.contract.create({
        data: {
          contractNumber: input.number,
          companyId: input.companyId,
          vehicleId: input.vehicleId,
          customerId,
          createdByUserId: adminUserId,
          status: input.status,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 400,
          startAt: input.startAt,
        },
        select: { id: true },
      });
    }

    async function overview(query = ""): Promise<Overview> {
      const res = await app.inject({
        method: "GET",
        url: `/dashboard/overview${query}`,
        headers: auth(),
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data as Overview;
    }

    function sumActivity(points: Array<{ rented: number; returned: number }> | null, key: "rented" | "returned") {
      return (points ?? []).reduce((total, point) => total + point[key], 0);
    }

    async function expectedExpenses(company: "ALL" | number | null, from: Date, to: Date) {
      const companyWhere = company === "ALL" ? {} : { companyId: company };
      const period = { occurredAt: { gte: from, lt: to }, ...companyWhere };
      const [expenses, reversals] = await Promise.all([
        prisma.financialLedgerEntry.aggregate({
          where: { ...period, kind: { in: ["MAINTENANCE_EXPENSE", "MANUAL_EXPENSE"] } },
          _sum: { amount: true },
        }),
        prisma.financialLedgerEntry.aggregate({
          where: { ...period, kind: "MANUAL_EXPENSE_REVERSAL" },
          _sum: { amount: true },
        }),
      ]);
      return (expenses._sum.amount ?? 0) - (reversals._sum.amount ?? 0);
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("dashboard company scope integration refuses to run unless DATABASE_URL is haidara_test");
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
      customerId = (await prisma.customer.create({ data: { name: `Scope Customer ${run}` } })).id;

      const { resolveBusinessDay } = await import("src/modules/reports/periods");
      const businessToday = resolveBusinessDay(new Date(), env.BUSINESS_TIMEZONE_OFFSET_MINUTES);
      const today = new Date(businessToday.from.getTime() + 60 * 60 * 1000);
      const now = new Date();

      const uniqueVehicle = await createVehicle(uniqueCompanyId, "U");
      const eliteVehicle = await createVehicle(eliteCompanyId, "E");
      const uniqueActive = await createContract({
        number: `SCP-AU-${run}`,
        companyId: uniqueCompanyId,
        vehicleId: uniqueVehicle,
        status: "ACTIVE",
        startAt: today,
      });
      const eliteActive = await createContract({
        number: `SCP-AE-${run}`,
        companyId: eliteCompanyId,
        vehicleId: eliteVehicle,
        status: "ACTIVE",
        startAt: today,
      });
      await createContract({
        number: `SCP-DU-${run}`,
        companyId: uniqueCompanyId,
        vehicleId: await createVehicle(uniqueCompanyId, "DU"),
        status: "PAID",
        startAt: today,
      });
      await createContract({
        number: `SCP-DE-${run}`,
        companyId: eliteCompanyId,
        vehicleId: await createVehicle(eliteCompanyId, "DE"),
        status: "PAID",
        startAt: today,
      });

      await prisma.contractCarOut.create({
        data: {
          contractId: uniqueActive.id,
          performedByUserId: adminUserId,
          occurredAt: now,
          mileageOut: 100,
          fuelOut: "FULL",
        },
      });
      await prisma.contractCarOut.create({
        data: {
          contractId: eliteActive.id,
          performedByUserId: adminUserId,
          occurredAt: now,
          mileageOut: 80,
          fuelOut: "HALF",
        },
      });
      await prisma.contractCarIn.create({
        data: { contractId: uniqueActive.id, occurredAt: now, mileageIn: 140, fuelIn: "HALF" },
      });

      const ledger = (
        suffix: string,
        amount: number,
        companyId: number | null,
      ) =>
        prisma.financialLedgerEntry.create({
          data: {
            kind: "MANUAL_EXPENSE",
            sourceType: "MANUAL_EXPENSE",
            sourceId: `dash-scope-${run}-${suffix}`,
            dedupeKey: `dash-scope-${run}-${suffix}`,
            amount,
            occurredAt: now,
            companyId,
          },
        });
      await ledger("U", 111, uniqueCompanyId);
      await ledger("E", 222, eliteCompanyId);
      await ledger("G", 50, null);
    });

    after(async () => {
      if (app) await app.close();
    });

    test("no company filter is All Companies and matches the unscoped request", async () => {
      const plain = await overview();
      const explicit = await overview("?");
      assert.equal(plain.kpis.fleetTotal, explicit.kpis.fleetTotal);
      assert.equal(plain.kpis.contractsTotal, explicit.kpis.contractsTotal);
      assert.equal(plain.weeklyFinance?.expenses, explicit.weeklyFinance?.expenses);
      const numbers = plain.todayDeliveries?.map((row) => row.contractNumber) ?? [];
      assert.ok(numbers.includes(`SCP-DU-${run}`));
      assert.ok(numbers.includes(`SCP-DE-${run}`));
    });

    test("fleet KPIs scope by Vehicle.company", async () => {
      const all = await overview();
      const unique = await overview(`?companyId=${uniqueCompanyId}`);
      const elite = await overview(`?companyId=${eliteCompanyId}`);
      assert.ok(all.fleetStatus && unique.fleetStatus && elite.fleetStatus);
      assert.equal(all.kpis.fleetTotal, all.fleetStatus!.total);
      assert.equal(unique.kpis.fleetTotal, unique.fleetStatus!.total);
      assert.equal(elite.kpis.fleetTotal, elite.fleetStatus!.total);
      assert.equal(all.fleetStatus!.total, unique.fleetStatus!.total + elite.fleetStatus!.total);
      assert.ok(unique.fleetStatus!.total >= 2);
      assert.ok(elite.fleetStatus!.total >= 2);
      assert.ok(unique.kpis.fleetTotal! < all.kpis.fleetTotal!);
      assert.ok(elite.kpis.fleetTotal! < all.kpis.fleetTotal!);
    });

    test("contract KPIs and active rentals scope by Contract.company", async () => {
      const all = await overview();
      const unique = await overview(`?companyId=${uniqueCompanyId}`);
      const elite = await overview(`?companyId=${eliteCompanyId}`);
      assert.equal(all.kpis.contractsTotal, unique.kpis.contractsTotal! + elite.kpis.contractsTotal!);
      assert.equal(all.kpis.activeRentals, unique.kpis.activeRentals! + elite.kpis.activeRentals!);
      assert.equal(all.kpis.deliveriesToday, unique.kpis.deliveriesToday! + elite.kpis.deliveriesToday!);
      assert.ok(unique.kpis.activeRentals! >= 1);
      assert.ok(elite.kpis.activeRentals! >= 1);
      assert.ok(unique.kpis.activeRentals! < all.kpis.activeRentals!);
    });

    test("today deliveries and recent contracts keep identity and follow the scope", async () => {
      const unique = await overview(`?companyId=${uniqueCompanyId}`);
      const elite = await overview(`?companyId=${eliteCompanyId}`);
      const uniqueDeliveries = unique.todayDeliveries ?? [];
      const eliteDeliveries = elite.todayDeliveries ?? [];
      assert.ok(uniqueDeliveries.some((row) => row.contractNumber === `SCP-DU-${run}`));
      assert.equal(uniqueDeliveries.some((row) => row.contractNumber === `SCP-DE-${run}`), false);
      assert.ok(eliteDeliveries.some((row) => row.contractNumber === `SCP-DE-${run}`));
      assert.ok(uniqueDeliveries.every((row) => row.company.code === "UNIQUE"));
      assert.ok(eliteDeliveries.every((row) => row.company.code === "ELITE"));

      const uniqueRecent = unique.recentContracts ?? [];
      const eliteRecent = elite.recentContracts ?? [];
      assert.ok(uniqueRecent.some((row) => row.contractNumber === `SCP-AU-${run}`));
      assert.equal(uniqueRecent.some((row) => row.company.code === "ELITE"), false);
      assert.ok(eliteRecent.some((row) => row.contractNumber === `SCP-AE-${run}`));
      assert.ok(eliteRecent.every((row) => row.company.code === "ELITE"));
    });

    test("weekly finance scopes the ledger and All Companies includes GENERAL", async () => {
      const all = await overview();
      const unique = await overview(`?companyId=${uniqueCompanyId}`);
      const elite = await overview(`?companyId=${eliteCompanyId}`);
      assert.ok(all.weeklyFinance && unique.weeklyFinance && elite.weeklyFinance);
      const from = new Date(all.range.from);
      const to = new Date(all.range.to);
      const allExpenses = await expectedExpenses("ALL", from, to);
      const uniqueExpenses = await expectedExpenses(uniqueCompanyId, from, to);
      const eliteExpenses = await expectedExpenses(eliteCompanyId, from, to);
      const generalExpenses = await expectedExpenses(null, from, to);
      assert.equal(all.weeklyFinance!.expenses, allExpenses);
      assert.equal(unique.weeklyFinance!.expenses, uniqueExpenses);
      assert.equal(elite.weeklyFinance!.expenses, eliteExpenses);
      assert.equal(allExpenses, uniqueExpenses + eliteExpenses + generalExpenses);
      assert.ok(generalExpenses >= 50);
      assert.ok(uniqueExpenses < allExpenses);
      assert.ok(eliteExpenses < allExpenses);
      assert.equal(
        all.weeklyFinance!.netMovement,
        all.weeklyFinance!.collected - all.weeklyFinance!.expenses,
      );
    });

    test("weekly rental activity follows Contract.company", async () => {
      const all = await overview();
      const unique = await overview(`?companyId=${uniqueCompanyId}`);
      const elite = await overview(`?companyId=${eliteCompanyId}`);
      const from = new Date(all.range.from);
      const to = new Date(all.range.to);
      async function outs(companyId?: number) {
        return prisma.contractCarOut.count({
          where: {
            occurredAt: { gte: from, lt: to },
            ...(companyId != null ? { contract: { companyId } } : {}),
          },
        });
      }
      assert.equal(sumActivity(all.weeklyRentalActivity, "rented"), await outs());
      assert.equal(sumActivity(unique.weeklyRentalActivity, "rented"), await outs(uniqueCompanyId));
      assert.equal(sumActivity(elite.weeklyRentalActivity, "rented"), await outs(eliteCompanyId));
      assert.equal(
        sumActivity(all.weeklyRentalActivity, "rented"),
        sumActivity(unique.weeklyRentalActivity, "rented") + sumActivity(elite.weeklyRentalActivity, "rented"),
      );
      assert.ok(sumActivity(unique.weeklyRentalActivity, "returned") >= 1);
      assert.equal(
        sumActivity(all.weeklyRentalActivity, "returned"),
        sumActivity(unique.weeklyRentalActivity, "returned") + sumActivity(elite.weeklyRentalActivity, "returned"),
      );
    });

    test("GENERAL is rejected as a dashboard scope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/dashboard/overview?companyScope=GENERAL",
        headers: auth(),
      });
      assert.equal(res.statusCode, 422, res.body);
      assert.equal(res.json().error.context.reason, "DASHBOARD_COMPANY_SCOPE_UNSUPPORTED");
    });
  });
}
