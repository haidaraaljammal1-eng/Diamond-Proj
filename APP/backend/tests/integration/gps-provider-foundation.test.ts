import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as resolveCompanyId } from "tests/helpers/operating-company";
import {
  assignVehicleGpsBindingFixture,
  createGpsProviderAccountFixture,
} from "tests/helpers/gps-fixture";
import { AppError } from "src/lib/errors/app-error";
import { GpsErrorReason } from "src/modules/gps/gps.errors";

function errorReason(err: unknown): string | undefined {
  return err instanceof AppError ? (err.context?.reason as string | undefined) : undefined;
}
import { createGpsBindingService } from "src/modules/gps/gps-binding.service";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "gps provider foundation skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  let eliteId = 0;
  let uniqueId = 0;
  let eliteVehicleId = 0;
  let uniqueVehicleId = 0;

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    eliteId = await resolveCompanyId(prisma, "ELITE");
    uniqueId = await resolveCompanyId(prisma, "UNIQUE");

    const { createVehiclesService } = await import("src/modules/vehicles/vehicles.service");
    const vehicles = createVehiclesService(app);
    const elite = await vehicles.create({
      companyId: eliteId,
      vehicleName: `GPS Elite ${run}`,
      dailyRate: 100,
      monthlyRate: 2000,
    });
    const unique = await vehicles.create({
      companyId: uniqueId,
      vehicleName: `GPS Unique ${run}`,
      dailyRate: 100,
      monthlyRate: 2000,
    });
    eliteVehicleId = elite.id;
    uniqueVehicleId = unique.id;
  });

  after(async () => {
    await app.close();
  });

  test("provider account unique on providerKey + accountKey", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `uniq-${run}`,
      displayName: "Test",
    });
    await assert.rejects(
      () =>
        createGpsProviderAccountFixture(prisma, {
          providerKey: "TEST_GPS",
          accountKey: `uniq-${run}`,
          displayName: "Dup",
        }),
      /Unique constraint/,
    );
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("ELITE-scoped account rejects UNIQUE vehicle and accepts ELITE vehicle", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "LIVE_GPS",
      accountKey: `elite-scope-${run}`,
      displayName: "Live GPS ELITE",
      companyScopeId: eliteId,
    });
    const bindings = createGpsBindingService(prisma);

    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `dev-elite-${run}`,
    });

    try {
      await bindings.assignBinding({
        vehicleId: uniqueVehicleId,
        providerAccountId: account.id,
        externalDeviceId: `dev-unique-${run}`,
      });
      assert.fail("expected company scope violation");
    } catch (err) {
      assert.equal(errorReason(err), GpsErrorReason.COMPANY_SCOPE_VIOLATION);
    }

    await prisma.vehicleGpsBinding.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("unscoped account allows ELITE and UNIQUE vehicles", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `open-${run}`,
      displayName: "Open scope",
      companyScopeId: null,
    });
    const bindings = createGpsBindingService(prisma);
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `open-elite-${run}`,
    });
    await bindings.assignBinding({
      vehicleId: uniqueVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `open-unique-${run}`,
    });
    await prisma.vehicleGpsBinding.deleteMany({
      where: { vehicleId: { in: [eliteVehicleId, uniqueVehicleId] } },
    });
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("device id is unique per active account assignment", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `device-${run}`,
      displayName: "Device scope",
    });
    const bindings = createGpsBindingService(prisma);
    const sharedDevice = `shared-dev-${run}`;
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: sharedDevice,
    });
    try {
      await bindings.assignBinding({
        vehicleId: uniqueVehicleId,
        providerAccountId: account.id,
        externalDeviceId: sharedDevice,
      });
      assert.fail("expected device conflict");
    } catch (err) {
      assert.equal(errorReason(err), GpsErrorReason.DEVICE_ALREADY_BOUND);
    }
    await prisma.vehicleGpsBinding.deleteMany({
      where: { vehicleId: { in: [eliteVehicleId, uniqueVehicleId] } },
    });
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("same external device id on different accounts is allowed", async () => {
    const a1 = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `acc-a-${run}`,
      displayName: "A",
    });
    const a2 = await createGpsProviderAccountFixture(prisma, {
      providerKey: "OTHER_GPS",
      accountKey: `acc-b-${run}`,
      displayName: "B",
    });
    const device = `cross-acc-${run}`;
    await assignVehicleGpsBindingFixture(prisma, {
      vehicleId: eliteVehicleId,
      providerAccountId: a1.id,
      externalDeviceId: device,
    });
    await assignVehicleGpsBindingFixture(prisma, {
      vehicleId: uniqueVehicleId,
      providerAccountId: a2.id,
      externalDeviceId: device,
    });
    await prisma.vehicleGpsBinding.deleteMany({
      where: { vehicleId: { in: [eliteVehicleId, uniqueVehicleId] } },
    });
    await prisma.gpsProviderAccount.deleteMany({ where: { id: { in: [a1.id, a2.id] } } });
  });

  test("rebind writes history and clears latest state", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `rebind-${run}`,
      displayName: "Rebind",
    });
    const bindings = createGpsBindingService(prisma);
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `rb-1-${run}`,
    });

    const { createGpsService } = await import("src/modules/gps/gps.service");
    const gps = createGpsService(app);
    await gps.ingestLatestPosition({
      vehicleId: eliteVehicleId,
      capturedAt: new Date("2026-09-10T10:00:00.000Z"),
      latitude: 25.0,
      longitude: 55.0,
      sourceEventId: `rb-${run}`,
    });
    assert.ok(await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId: eliteVehicleId } }));

    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `rb-2-${run}`,
    });

    const history = await prisma.vehicleGpsBindingHistory.findMany({
      where: { vehicleId: eliteVehicleId },
    });
    assert.equal(history.length, 1);
    assert.equal(history[0]?.externalDeviceId, `rb-1-${run}`);
    assert.equal(
      await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId: eliteVehicleId } }),
      null,
    );

    await gps.ingestLatestPosition({
      vehicleId: eliteVehicleId,
      capturedAt: new Date("2026-09-10T11:00:00.000Z"),
      latitude: 25.1,
      longitude: 55.1,
      sourceEventId: `rb-${run}-2`,
    });
    const binding = await prisma.vehicleGpsBinding.findUniqueOrThrow({
      where: { vehicleId: eliteVehicleId },
    });
    assert.equal(binding.externalDeviceId, `rb-2-${run}`);

    await prisma.vehicleGpsLatestState.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.vehicleGpsBindingHistory.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.vehicleGpsBinding.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("stored credentials mark the provider configured before sync wiring", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "LIVE_GPS",
      accountKey: `cred-${run}`,
      displayName: "Cred",
      enabled: true,
      withCredentials: true,
    });
    const { isGpsProviderConfigured } = await import("src/modules/gps/gps-provider-configured");
    assert.equal(await isGpsProviderConfigured(prisma), true);
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("disabled ELITE-scoped account still allows ELITE binding", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "LIVE_GPS",
      accountKey: `elite-off-${run}`,
      displayName: "ELITE disabled",
      companyScopeId: eliteId,
      enabled: false,
    });
    const bindings = createGpsBindingService(prisma);
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `off-elite-${run}`,
    });
    await prisma.vehicleGpsBinding.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("disabled ELITE-scoped account still rejects UNIQUE binding", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "LIVE_GPS",
      accountKey: `elite-off-reject-${run}`,
      displayName: "ELITE disabled",
      companyScopeId: eliteId,
      enabled: false,
    });
    const bindings = createGpsBindingService(prisma);
    try {
      await bindings.assignBinding({
        vehicleId: uniqueVehicleId,
        providerAccountId: account.id,
        externalDeviceId: `off-unique-${run}`,
      });
      assert.fail("expected scope violation");
    } catch (err) {
      assert.equal(errorReason(err), GpsErrorReason.COMPANY_SCOPE_VIOLATION);
    }
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });

  test("rebind to a disabled valid account succeeds", async () => {
    const accountA = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `from-${run}`,
      displayName: "From",
      enabled: true,
    });
    const accountB = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `to-disabled-${run}`,
      displayName: "To disabled",
      enabled: false,
    });
    const bindings = createGpsBindingService(prisma);
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: accountA.id,
      externalDeviceId: `from-dev-${run}`,
    });
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: accountB.id,
      externalDeviceId: `to-dev-${run}`,
    });
    const binding = await prisma.vehicleGpsBinding.findUniqueOrThrow({
      where: { vehicleId: eliteVehicleId },
    });
    assert.equal(binding.providerAccountId, accountB.id);
    assert.equal(binding.isActive, true);

    await prisma.vehicleGpsBindingHistory.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.vehicleGpsBinding.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.gpsProviderAccount.deleteMany({ where: { id: { in: [accountA.id, accountB.id] } } });
  });

  test("disabling bound account keeps binding and latest state", async () => {
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_GPS",
      accountKey: `disable-keep-${run}`,
      displayName: "Disable keep",
      enabled: true,
    });
    const bindings = createGpsBindingService(prisma);
    await bindings.assignBinding({
      vehicleId: eliteVehicleId,
      providerAccountId: account.id,
      externalDeviceId: `keep-dev-${run}`,
    });
    const { createGpsService } = await import("src/modules/gps/gps.service");
    const gps = createGpsService(app);
    await gps.ingestLatestPosition({
      vehicleId: eliteVehicleId,
      capturedAt: new Date("2026-09-10T12:00:00.000Z"),
      latitude: 25.5,
      longitude: 55.5,
      sourceEventId: `keep-${run}`,
    });
    const historyBefore = await prisma.vehicleGpsBindingHistory.count({
      where: { vehicleId: eliteVehicleId },
    });

    await prisma.gpsProviderAccount.update({
      where: { id: account.id },
      data: {
        enabled: false,
        lastFailureCode: "AUTH_FAILED",
        lastSuccessfulSyncAt: null,
      },
    });

    const binding = await prisma.vehicleGpsBinding.findUniqueOrThrow({
      where: { vehicleId: eliteVehicleId },
    });
    assert.equal(binding.isActive, true);
    assert.ok(await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId: eliteVehicleId } }));
    const historyAfter = await prisma.vehicleGpsBindingHistory.count({
      where: { vehicleId: eliteVehicleId },
    });
    assert.equal(historyAfter, historyBefore);

    await prisma.vehicleGpsLatestState.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.vehicleGpsBinding.deleteMany({ where: { vehicleId: eliteVehicleId } });
    await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
  });
}
