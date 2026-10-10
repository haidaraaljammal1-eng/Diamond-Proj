import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import { GPS_CAPABILITIES_NONE } from "src/modules/gps/gps-provider.capabilities";
import { setGpsProviderAdapterForTests, clearGpsProviderAdapterTestOverrides } from "src/modules/gps/gps-provider.registry";
import { registerGpsAcceptedPositionObserver } from "src/modules/gps/gps.observers";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("GPS health integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  let app: FastifyInstance;
  let prisma: PrismaClient;
  let token = "";
  let vehicleId = 0;
  let unboundVehicleId = 0;
  let bindingId = "";
  let metadataMode: "success" | "unsupported" | "error" | "malformed" = "success";
  let metadataCalls = 0;
  let observed = 0;

  const auth = (value: string) => ({ authorization: `Bearer ${value}` });
  const adapter: GpsProviderAdapter = {
    providerKey: "TEST_HEALTH",
    displayName: "Synthetic health adapter",
    supportsFleetSync: false,
    staticCapabilities: { ...GPS_CAPABILITIES_NONE, deviceMetadata: true },
    async fetchDeviceMetadata() {
      metadataCalls += 1;
      if (metadataMode === "error") throw new Error("synthetic metadata failure");
      if (metadataMode === "malformed") return { deviceModel: null };
      return { deviceModel: metadataMode === "unsupported" ? null : "Synthetic Tracker" };
    },
  };

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("GPS health integration refuses non-disposable database");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const role = await prisma.role.upsert({
      where: { key: "gps_health_reader" },
      update: {},
      create: { key: "gps_health_reader", name: "GPS health reader" },
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
    const email = `gps-health-${Date.now()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email: normalizeEmail(email),
        name: "GPS health reader",
        status: "ACTIVE",
        passwordHash: await hashPassword("gps-health-password"),
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "gps-health-password" },
    });
    assert.equal(login.statusCode, 200, login.body);
    token = login.json().data.accessToken;

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
    const bound = await createVehicle("Health bound");
    const unbound = await createVehicle("Health unbound");
    vehicleId = bound.id;
    unboundVehicleId = unbound.id;
    const { createGpsProviderAccountFixture, assignVehicleGpsBindingFixture } = await import(
      "tests/helpers/gps-fixture"
    );
    const account = await createGpsProviderAccountFixture(prisma, {
      providerKey: "TEST_HEALTH",
      accountKey: `health-${Date.now()}`,
      displayName: "Synthetic health",
      withCredentials: true,
    });
    const binding = await assignVehicleGpsBindingFixture(prisma, {
      vehicleId,
      providerAccountId: account.id,
      externalDeviceId: "synthetic-health-device",
    });
    bindingId = binding.bindingId;
    setGpsProviderAdapterForTests("TEST_HEALTH", adapter);
  });

  after(async () => {
    clearGpsProviderAdapterTestOverrides();
    if (app) await app.close();
  });

  async function setLatest(capturedAt: Date | null) {
    if (capturedAt) {
      await prisma.vehicleGpsLatestState.upsert({
        where: { vehicleId },
        update: { capturedAt, receivedAt: capturedAt },
        create: {
          vehicleId,
          bindingId,
          latitude: 25,
          longitude: 55,
          motionState: "PARKED",
          capturedAt,
          receivedAt: capturedAt,
        },
      });
    } else {
      await prisma.vehicleGpsLatestState.deleteMany({ where: { vehicleId } });
    }
  }

  test("health route requires gps.read and returns provider-neutral health", async () => {
    const forbidden = await app.inject({ method: "GET", url: `/gps/vehicles/${vehicleId}/health` });
    assert.ok(forbidden.statusCode === 401 || forbidden.statusCode === 403);
    await setLatest(new Date(Date.now() - 30_000));
    metadataMode = "success";
    const response = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${vehicleId}/health`,
      headers: auth(token),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.health, "ONLINE");
    assert.equal(response.json().data.deviceModel, "Synthetic Tracker");
    for (const secret of [
      "TEST_HEALTH",
      "synthetic-health-device",
      "providerKey",
      "providerAccountId",
      "externalDeviceId",
      "deviceid",
      "IMEI",
      "SIM",
      "DeviceOnOFF",
    ]) {
      assert.equal(response.body.includes(secret), false, secret);
    }
  });

  test("health thresholds classify stale, offline, and missing latest state", async () => {
    const now = Date.now();
    for (const [age, expected] of [[119, "ONLINE"], [120, "ONLINE"], [121, "STALE"], [600, "STALE"], [601, "OFFLINE"]] as const) {
      await setLatest(new Date(now - age * 1000));
      const response = await app.inject({
        method: "GET",
        url: `/gps/vehicles/${vehicleId}/health`,
        headers: auth(token),
      });
      assert.equal(response.json().data.health, expected);
    }
    await setLatest(null);
    const missing = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${vehicleId}/health`,
      headers: auth(token),
    });
    assert.equal(missing.json().data.health, "OFFLINE");
    assert.equal(missing.json().data.lastCommunicationAt, null);
    assert.equal(missing.json().data.ageSeconds, null);
    assert.equal(missing.json().data.deviceModel, "Synthetic Tracker");
  });

  test("metadata unsupported, malformed, or failed does not break core health", async () => {
    await setLatest(new Date(Date.now() - 30_000));
    for (const mode of ["unsupported", "malformed", "error"] as const) {
      metadataMode = mode;
      const response = await app.inject({
        method: "GET",
        url: `/gps/vehicles/${vehicleId}/health`,
        headers: auth(token),
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().data.health, "ONLINE");
      assert.equal(response.json().data.deviceModel, null);
    }
    assert.equal(metadataCalls, 10);
  });

  test("missing binding is handled safely and reads do not mutate state", async () => {
    const before = {
      vehicle: await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
      binding: await prisma.vehicleGpsBinding.findUniqueOrThrow({ where: { vehicleId } }),
      latest: await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId } }),
      contracts: await prisma.contract.count({ where: { vehicleId } }),
      liabilities: await prisma.roadLiability.count(),
      notifications: await prisma.notification.count(),
    };
    const unregister = registerGpsAcceptedPositionObserver({
      onAcceptedPosition: async () => { observed += 1; },
    });
    const missing = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${unboundVehicleId}/health`,
      headers: auth(token),
    });
    assert.equal(missing.statusCode, 200, missing.body);
    assert.equal(missing.json().data.health, "OFFLINE");
    const after = {
      vehicle: await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
      binding: await prisma.vehicleGpsBinding.findUniqueOrThrow({ where: { vehicleId } }),
      latest: await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId } }),
      contracts: await prisma.contract.count({ where: { vehicleId } }),
      liabilities: await prisma.roadLiability.count(),
      notifications: await prisma.notification.count(),
    };
    unregister();
    assert.deepEqual(after, before);
    assert.equal(observed, 0);
  });
}
