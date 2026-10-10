import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import { GPS_CAPABILITIES_NONE } from "src/modules/gps/gps-provider.capabilities";
import type {
  GpsProviderReportContext,
  ProviderMileageSummary,
  ProviderOverspeedFetchResult,
} from "src/modules/gps/gps-provider.types";
import {
  clearGpsProviderAdapterTestOverrides,
  setGpsProviderAdapterForTests,
} from "src/modules/gps/gps-provider.registry";
import { registerGpsAcceptedPositionObserver } from "src/modules/gps/gps.observers";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("GPS report integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  let app: FastifyInstance;
  let prisma: PrismaClient;
  let readerToken = "";
  let boundVehicleId = 0;
  let unboundVehicleId = 0;
  let unsupportedVehicleId = 0;
  let mileageCalls = 0;
  let overspeedCalls = 0;
  let observed = 0;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const reportAdapter: GpsProviderAdapter = {
    providerKey: "TEST_REPORTS",
    displayName: "Synthetic report adapter",
    supportsFleetSync: false,
    staticCapabilities: {
      ...GPS_CAPABILITIES_NONE,
      mileageSummary: true,
      overspeedReport: true,
    },
    async fetchMileageSummary(ctx: GpsProviderReportContext): Promise<ProviderMileageSummary> {
      mileageCalls += 1;
      assert.equal(ctx.externalDeviceId, "synthetic-device");
      return { todayKm: 51.88, yesterdayKm: 0, thisMonthKm: 400.5, lastMonthKm: 12 };
    },
    async fetchOverspeed(
      ctx: GpsProviderReportContext & { date: string; thresholdKph: number },
    ): Promise<ProviderOverspeedFetchResult> {
      overspeedCalls += 1;
      assert.equal(ctx.externalDeviceId, "synthetic-device");
      assert.equal(ctx.date, "2026-10-09");
      assert.equal(ctx.thresholdKph, 80);
      return {
        providerRowCount: 1,
        invalidRowCount: 0,
        events: [
          {
            startedAt: new Date("2026-10-09T05:10:00.000Z"),
            endedAt: new Date("2026-10-09T05:25:00.000Z"),
            averageSpeedKph: 84,
            maxSpeedKph: 101,
            durationMinutes: 15,
            addressLine: null,
          },
        ],
      };
    },
  };

  const emptyOverspeedAdapter: GpsProviderAdapter = {
    ...reportAdapter,
    providerKey: "TEST_EMPTY_REPORTS",
    async fetchOverspeed() {
      overspeedCalls += 1;
      return { providerRowCount: 0, invalidRowCount: 0, events: [] };
    },
  };

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("GPS report integration refuses non-disposable database");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;

    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const role = await prisma.role.upsert({
      where: { key: "gps_report_reader" },
      update: {},
      create: { key: "gps_report_reader", name: "GPS report reader" },
    });
    const permission = await prisma.permission.upsert({
      where: { key: "gps.read" },
      update: {},
      create: { key: "gps.read", category: "gps", description: "Read GPS" },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
    const email = `gps-report-reader-${Date.now()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email: normalizeEmail(email),
        name: "GPS report reader",
        status: "ACTIVE",
        passwordHash: await hashPassword("gps-report-password"),
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "gps-report-password" },
    });
    assert.equal(login.statusCode, 200, login.body);
    readerToken = login.json().data.accessToken;

    const companyId = await testCompanyId(prisma);
    const createVehicle = async (name: string) =>
      prisma.vehicle.create({
        data: {
          companyId,
          vehicleName: `${name}-${Date.now()}-${Math.random()}`,
          modelYear: 2025,
          color: "Black",
        },
      });
    const bound = await createVehicle("Report bound");
    const unbound = await createVehicle("Report unbound");
    const unsupported = await createVehicle("Report unsupported");
    boundVehicleId = bound.id;
    unboundVehicleId = unbound.id;
    unsupportedVehicleId = unsupported.id;

    const { createGpsProviderAccountFixture, assignVehicleGpsBindingFixture } = await import(
      "tests/helpers/gps-fixture"
    );
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_REPORTS",
      accountKey: `reports-${Date.now()}`,
      displayName: "Synthetic reports",
      withCredentials: true,
    });
    await assignVehicleGpsBindingFixture(prisma, {
      vehicleId: boundVehicleId,
      providerAccountId: account.id,
      externalDeviceId: "synthetic-device",
    });
    const emptyAccount = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_EMPTY_REPORTS",
      accountKey: `empty-${Date.now()}`,
      displayName: "Synthetic empty reports",
      withCredentials: true,
    });
    await assignVehicleGpsBindingFixture(prisma, {
      vehicleId: unsupportedVehicleId,
      providerAccountId: emptyAccount.id,
      externalDeviceId: "synthetic-empty-device",
    });

    setGpsProviderAdapterForTests("TEST_REPORTS", reportAdapter);
    setGpsProviderAdapterForTests("TEST_EMPTY_REPORTS", emptyOverspeedAdapter);
  });

  after(async () => {
    clearGpsProviderAdapterTestOverrides();
    if (app) await app.close();
  });

  test("report routes require gps.read and return normalized synthetic reports", async () => {
    const forbidden = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${boundVehicleId}/mileage-summary`,
    });
    assert.ok(forbidden.statusCode === 401 || forbidden.statusCode === 403);

    const mileage = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${boundVehicleId}/mileage-summary`,
      headers: auth(readerToken),
    });
    assert.equal(mileage.statusCode, 200, mileage.body);
    assert.deepEqual(mileage.json().data, {
      vehicleId: boundVehicleId,
      todayKm: 51.88,
      yesterdayKm: 0,
      thisMonthKm: 400.5,
      lastMonthKm: 12,
    });
    assert.equal(mileage.body.includes("externalDeviceId"), false);
    assert.equal(mileage.body.includes("synthetic-device"), false);
    for (const secret of ["providerKey", "providerAccountId", "deviceid", "IMEI", "SIM"]) {
      assert.equal(mileage.body.includes(secret), false, secret);
    }
    assert.equal(mileageCalls, 1);

    const overspeed = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${boundVehicleId}/overspeed?date=2026-10-09&thresholdKph=80`,
      headers: auth(readerToken),
    });
    assert.equal(overspeed.statusCode, 200, overspeed.body);
    const event = overspeed.json().data.events[0];
    assert.equal(event.maxSpeedKph, 101);
    assert.equal(event.averageSpeedKph, 84);
    assert.equal(event.durationMinutes, 15);
    assert.equal(event.addressLine, null);
    assert.equal(overspeed.body.includes("synthetic-device"), false);
    assert.equal(overspeed.body.includes("top_speed"), false);
    for (const secret of ["providerKey", "providerAccountId", "deviceid", "IMEI", "SIM"]) {
      assert.equal(overspeed.body.includes(secret), false, secret);
    }
    assert.equal(overspeed.body.includes("providerRowCount"), false);
    assert.equal(overspeedCalls, 1);
  });

  test("report reads handle missing binding, unsupported capability, empty results, and invalid threshold", async () => {
    const missing = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${unboundVehicleId}/mileage-summary`,
      headers: auth(readerToken),
    });
    assert.equal(missing.statusCode, 409);
    assert.equal(missing.json().error.context.reason, "GPS_BINDING_NOT_FOUND");

    const invalid = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${boundVehicleId}/overspeed?date=2026-10-09&thresholdKph=0`,
      headers: auth(readerToken),
    });
    assert.equal(invalid.statusCode, 422);

    const empty = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${unsupportedVehicleId}/overspeed?date=2026-10-09&thresholdKph=80`,
      headers: auth(readerToken),
    });
    assert.equal(empty.statusCode, 200, empty.body);
    assert.deepEqual(empty.json().data.events, []);

    const unsupportedAdapter = { ...reportAdapter, providerKey: "TEST_UNSUPPORTED" };
    setGpsProviderAdapterForTests("TEST_UNSUPPORTED", {
      ...unsupportedAdapter,
      staticCapabilities: GPS_CAPABILITIES_NONE,
      fetchMileageSummary: undefined,
      fetchOverspeed: undefined,
    });
    const unsupportedAccount = await prisma.gpsProviderAccount.create({
      data: {
        providerKey: "TEST_UNSUPPORTED",
        accountKey: `unsupported-${Date.now()}`,
        displayName: "Synthetic unsupported",
        enabled: true,
        secretEncrypted: "not-used",
      },
    });
    await (await import("tests/helpers/gps-fixture")).assignVehicleGpsBindingFixture(prisma, {
      vehicleId: unboundVehicleId,
      providerAccountId: unsupportedAccount.id,
      externalDeviceId: "unsupported-device",
    });
    const unsupported = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${unboundVehicleId}/mileage-summary`,
      headers: auth(readerToken),
    });
    assert.equal(unsupported.statusCode, 409);
    assert.equal(unsupported.json().error.context.reason, "GPS_MILEAGE_UNSUPPORTED");
  });

  test("report reads do not mutate business or GPS state and invoke no observers", async () => {
    const unregister = registerGpsAcceptedPositionObserver({
      onAcceptedPosition: async () => {
        observed += 1;
      },
    });
    const before = {
      vehicle: await prisma.vehicle.findUniqueOrThrow({ where: { id: boundVehicleId } }),
      binding: await prisma.vehicleGpsBinding.findUniqueOrThrow({ where: { vehicleId: boundVehicleId } }),
      latest: await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId: boundVehicleId } }),
      contracts: await prisma.contract.count({ where: { vehicleId: boundVehicleId } }),
      liabilities: await prisma.roadLiability.count(),
      notifications: await prisma.notification.count(),
    };
    await app.inject({
      method: "GET",
      url: `/gps/vehicles/${boundVehicleId}/mileage-summary`,
      headers: auth(readerToken),
    });
    await app.inject({
      method: "GET",
      url: `/gps/vehicles/${boundVehicleId}/overspeed?date=2026-10-09&thresholdKph=80`,
      headers: auth(readerToken),
    });
    const after = {
      vehicle: await prisma.vehicle.findUniqueOrThrow({ where: { id: boundVehicleId } }),
      binding: await prisma.vehicleGpsBinding.findUniqueOrThrow({ where: { vehicleId: boundVehicleId } }),
      latest: await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId: boundVehicleId } }),
      contracts: await prisma.contract.count({ where: { vehicleId: boundVehicleId } }),
      liabilities: await prisma.roadLiability.count(),
      notifications: await prisma.notification.count(),
    };
    unregister();
    assert.deepEqual(after, before);
    assert.equal(observed, 0);
  });
}
