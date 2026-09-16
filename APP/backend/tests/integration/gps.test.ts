import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Requires RUN_INTEGRATION=true and TEST_DATABASE_URL pointing at disposable
 * haidara_test — never Development haidara.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "gps integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = {
    email: `gps-admin-${run}@example.test`,
    password: "gps-admin-pass-123",
  };
  const reader = {
    email: `gps-reader-${run}@example.test`,
    password: "gps-reader-pass-123",
  };
  const stranger = {
    email: `gps-stranger-${run}@example.test`,
    password: "gps-stranger-pass-123",
  };
  let adminToken = "";
  let readerToken = "";
  let strangerToken = "";
  let namedVehicleId = 0;
  let platedVehicleId = 0;

  const ADMIN_PERMS = [
    "gps.read",
    "vehicles.read",
    "vehicles.manage",
  ];

  async function seedUser(
    email: string,
    password: string,
    roleKey: string,
    perms: string[],
  ) {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const canonicalEmail = normalizeEmail(email);
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey },
    });
    for (const key of perms) {
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
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: canonicalEmail },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  async function login(creds: { email: string; password: string }) {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
    assert.equal(res.statusCode, 200);
    return res.json().data.accessToken as string;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function createVehicle(payload: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload,
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data as { id: number };
  }

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("gps integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(admin.email, admin.password, `gps_admin_${run}`, ADMIN_PERMS);
    await seedUser(reader.email, reader.password, `gps_reader_${run}`, ["gps.read"]);
    await seedUser(stranger.email, stranger.password, `gps_stranger_${run}`, ["vehicles.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);
    strangerToken = await login(stranger);

    namedVehicleId = (
      await createVehicle({
        vehicleName: `GPS Patrol ${run}`,
        plateNumber: `G ${run} NM`,
        modelYear: 2024,
        color: "White",
      })
    ).id;
    platedVehicleId = (
      await createVehicle({
        vehicleName: `GPS Civic ${run}`,
        plateNumber: `GPS-PLATE-${run}`,
        modelYear: 2023,
        color: "Black",
      })
    ).id;
  });

  after(async () => {
    const { setGpsProviderForTests } = await import("src/modules/gps/gps.provider");
    setGpsProviderForTests(undefined);
    await app.close();
  });

  test("application serves GPS reads with GPS disabled / unconfigured provider", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/gps/summary",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    const data = res.json().data;
    assert.equal(data.providerConfigured, false);
    assert.ok(data.totalVehicles >= 2);
    assert.equal(data.moving, 0);
    assert.equal(data.online, 0);
    assert.equal(data.trackedVehicles, 0);
    assert.equal(data.lastLocationUpdateAt, null);
  });

  test("gps.read is required — unauthorized and wrong permission are blocked", async () => {
    const anon = await app.inject({ method: "GET", url: "/gps/summary" });
    assert.ok(anon.statusCode === 401 || anon.statusCode === 403);

    const forbidden = await app.inject({
      method: "GET",
      url: "/gps/vehicles",
      headers: auth(strangerToken),
    });
    assert.equal(forbidden.statusCode, 403, forbidden.body);

    const publicGuess = await app.inject({
      method: "GET",
      url: "/public/gps/summary",
    });
    assert.equal(publicGuess.statusCode, 404);
  });

  test("list returns real active vehicles with NOT_CONFIGURED and no coordinates", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/gps/vehicles?pageSize=100",
      headers: auth(readerToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.ok(body.meta.total >= 2);
    const row = body.data.find((item: { vehicle: { id: number } }) => item.vehicle.id === namedVehicleId);
    assert.ok(row);
    assert.equal(row.gps.trackingStatus, "not_configured");
    assert.equal(row.gps.latitude, null);
    assert.equal(row.gps.longitude, null);
    assert.equal(row.currentRental, null);
    assert.ok(row.vehicle.displayName);
    assert.ok("primaryImageUrl" in row.vehicle);
    assert.ok("operationalStatus" in row.vehicle);
  });

  test("map-points is empty without GPS positions / when provider is not configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/gps/map-points",
      headers: auth(readerToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().data, []);
  });

  test("search by vehicle name and plate, with pagination", async () => {
    const byName = await app.inject({
      method: "GET",
      url: `/gps/vehicles?search=${encodeURIComponent(`Patrol ${run}`)}`,
      headers: auth(readerToken),
    });
    assert.equal(byName.statusCode, 200, byName.body);
    const nameHits = byName.json().data as Array<{ vehicle: { id: number } }>;
    assert.ok(nameHits.some((item) => item.vehicle.id === namedVehicleId));

    const byPlate = await app.inject({
      method: "GET",
      url: `/gps/vehicles?search=${encodeURIComponent(`GPS-PLATE-${run}`)}`,
      headers: auth(readerToken),
    });
    assert.equal(byPlate.statusCode, 200, byPlate.body);
    const plateHits = byPlate.json().data as Array<{ vehicle: { id: number } }>;
    assert.ok(plateHits.some((item) => item.vehicle.id === platedVehicleId));

    const page = await app.inject({
      method: "GET",
      url: "/gps/vehicles?page=1&pageSize=1",
      headers: auth(readerToken),
    });
    assert.equal(page.statusCode, 200, page.body);
    assert.equal(page.json().data.length, 1);
    assert.ok(page.json().meta.total >= 2);
    assert.ok(page.json().meta.totalPages >= 2);
  });

  test("vehicle detail projection and no provider secrets", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${namedVehicleId}`,
      headers: auth(readerToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    const data = res.json().data;
    assert.equal(data.vehicle.id, namedVehicleId);
    assert.equal(data.gps.trackingStatus, "not_configured");
    assert.equal(data.binding.assigned, false);
    const raw = res.body;
    assert.equal(raw.includes("GPS_API_KEY"), false);
    assert.equal(raw.includes("client_secret"), false);
    assert.equal(raw.includes("authorization"), false);
  });

  test("ingest validates, persists, replaces newer, ignores stale, and is idempotent", async () => {
    const { createGpsService } = await import("src/modules/gps/gps.service");
    const { setGpsProviderForTests } = await import("src/modules/gps/gps.provider");
    const gps = createGpsService(app);

    await prisma.vehicleGpsBinding.create({
      data: {
        vehicleId: namedVehicleId,
        providerKey: "test",
        externalDeviceId: `dev-${run}`,
        isActive: true,
      },
    });

    const older = new Date("2026-09-10T08:00:00.000Z");
    const newer = new Date("2026-09-10T09:00:00.000Z");

    const created = await gps.ingestLatestPosition({
      vehicleId: namedVehicleId,
      capturedAt: older,
      latitude: 25.1,
      longitude: 55.1,
      speedKph: 40,
      headingDegrees: 90,
      sourceEventId: `evt-${run}-a`,
    });
    assert.equal(created.applied, true);
    assert.equal(created.reason, "created");

    const stale = await gps.ingestLatestPosition({
      vehicleId: namedVehicleId,
      capturedAt: new Date("2026-09-10T07:00:00.000Z"),
      latitude: 24.0,
      longitude: 54.0,
      speedKph: 80,
      sourceEventId: `evt-${run}-old`,
    });
    assert.equal(stale.applied, false);
    assert.equal(stale.reason, "stale");

    const replaced = await gps.ingestLatestPosition({
      vehicleId: namedVehicleId,
      capturedAt: newer,
      latitude: 25.2,
      longitude: 55.2,
      speedKph: 0,
      sourceEventId: `evt-${run}-b`,
    });
    assert.equal(replaced.applied, true);
    assert.equal(replaced.reason, "replaced");

    const duplicate = await gps.ingestLatestPosition({
      vehicleId: namedVehicleId,
      capturedAt: new Date("2026-09-10T10:00:00.000Z"),
      latitude: 26.0,
      longitude: 56.0,
      sourceEventId: `evt-${run}-b`,
    });
    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.reason, "duplicate_event");

    const row = await prisma.vehicleGpsLatestState.findUniqueOrThrow({
      where: { vehicleId: namedVehicleId },
    });
    assert.equal(Number(row.latitude), 25.2);
    assert.equal(row.motionState, "PARKED");
    assert.equal(row.sourceEventId, `evt-${run}-b`);

    setGpsProviderForTests({ name: "test", configured: true });
    const points = await app.inject({
      method: "GET",
      url: "/gps/map-points",
      headers: auth(readerToken),
    });
    assert.equal(points.statusCode, 200, points.body);
    const point = points.json().data.find(
      (item: { vehicleId: number }) => item.vehicleId === namedVehicleId,
    );
    assert.ok(point);
    assert.equal(point.latitude, 25.2);
    assert.equal(point.longitude, 55.2);
    assert.ok(point.trackingStatus);
    assert.equal("customerName" in (point.currentRental ?? {}), false);

    const detail = await app.inject({
      method: "GET",
      url: `/gps/vehicles/${namedVehicleId}`,
      headers: auth(readerToken),
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().data.gps.latitude, 25.2);
    assert.equal(detail.json().data.binding.assigned, true);
    assert.equal(detail.json().data.binding.providerKey, "test");
    setGpsProviderForTests(undefined);
  });

  test("currentRental is batched onto the GPS list without a per-row contract fetch", async () => {
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: normalizeEmail(admin.email) },
    });
    const contract = await prisma.contract.create({
      data: {
        contractNumber: `DE-GPS-${run}`,
        status: "PAID",
        vehicleId: platedVehicleId,
        createdByUserId: adminUser.id,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 900,
        startAt: new Date("2026-09-10T08:00:00.000Z"),
        endAt: new Date("2026-09-13T08:00:00.000Z"),
        snapshot: { customer: { name: "GPS Tester" } },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `/gps/vehicles?search=${encodeURIComponent(`GPS-PLATE-${run}`)}`,
      headers: auth(readerToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    const row = res.json().data.find(
      (item: { vehicle: { id: number } }) => item.vehicle.id === platedVehicleId,
    );
    assert.ok(row);
    assert.equal(row.currentRental.contractId, contract.id);
    assert.equal(row.currentRental.contractNumber, `DE-GPS-${run}`);
    assert.equal(row.currentRental.status, "paid");
    assert.equal(row.currentRental.customerName, "GPS Tester");
    assert.ok(row.currentRental.startAt);
    assert.ok(row.currentRental.endAt);
  });
}
