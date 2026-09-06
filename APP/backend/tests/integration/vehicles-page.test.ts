import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Vehicles page backend tests (list/detail/status filter/card projection/photos).
 * Requires RUN_INTEGRATION=true and a disposable DATABASE_URL.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("vehicles page integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = { email: `veh-admin-${run}@example.test`, password: "veh-admin-pass-123" };
  const reader = { email: `veh-reader-${run}@example.test`, password: "veh-reader-pass-123" };
  let adminToken = "";
  let readerToken = "";
  let modelId = 0;
  let availableId = 0;
  let rentedId = 0;
  let serviceId = 0;

  const ADMIN_PERMS = ["vehicles.read", "vehicles.manage", "vehicle_models.read"];

  async function seedUser(email: string, password: string, roleKey: string, perms: string[]) {
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
    const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
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
      payload: { modelId, ...payload },
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data;
  }

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(admin.email, admin.password, `veh_admin_${run}`, ADMIN_PERMS);
    await seedUser(reader.email, reader.password, `veh_reader_${run}`, ["vehicles.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);

    const model = await prisma.vehicleModel.create({
      data: { code: `VEH-${run}`, name: "Patrol Platinum" },
    });
    modelId = model.id;

    availableId = (
      await createVehicle({
        vin: `VIN-${run}-AV`,
        plateNumber: `D ${run}01`,
        modelYear: 2024,
        color: "Black",
        dailyRate: 1200,
        monthlyRate: 24000,
        operationalStatus: "available",
      })
    ).id;

    rentedId = (
      await createVehicle({
        vin: `VIN-${run}-RT`,
        plateNumber: `D ${run}02`,
        dailyRate: 1000,
        monthlyRate: 20000,
        operationalStatus: "rented",
      })
    ).id;

    serviceId = (
      await createVehicle({
        vin: `VIN-${run}-SV`,
        plateNumber: `D ${run}03`,
        operationalStatus: "service",
      })
    ).id;
  });

  after(async () => {
    if (app) await app.close();
  });

  test("GET /vehicles requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/vehicles" });
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  });

  test("GET /vehicles rejects reader without vehicles.read on create only paths", async () => {
    const forbidden = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(readerToken),
      payload: { modelId, vin: `VIN-${run}-NOPE` },
    });
    assert.equal(forbidden.statusCode, 403);
  });

  test("GET /vehicles list returns card projection with pagination", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vehicles?page=1&pageSize=10",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.ok(Array.isArray(json.data));
    assert.deepEqual(Object.keys(json.meta).sort(), ["page", "pageSize", "total", "totalPages"]);
    const row = json.data.find((v: { id: number }) => v.id === availableId);
    assert.ok(row);
    assert.equal(row.displayName, "Patrol Platinum 2024");
    assert.equal(row.plateNumber, `D ${run}01`);
    assert.equal(row.dailyRate, 1200);
    assert.equal(row.monthlyRate, 24000);
    assert.equal(row.operationalStatus, "available");
    assert.equal(row.model.name, "Patrol Platinum");
    assert.equal(row.primaryImage, null);
    assert.equal(row.currentRental, null);
    assert.equal("gallery" in row, false);
  });

  test("GET /vehicles status filters", async () => {
    const available = await app.inject({
      method: "GET",
      url: "/vehicles?status=available",
      headers: auth(adminToken),
    });
    assert.equal(available.statusCode, 200);
    assert.ok(available.json().data.every((v: { operationalStatus: string }) => v.operationalStatus === "available"));

    const rented = await app.inject({
      method: "GET",
      url: "/vehicles?status=rented",
      headers: auth(adminToken),
    });
    assert.equal(rented.statusCode, 200);
    assert.ok(rented.json().data.some((v: { id: number }) => v.id === rentedId));

    const service = await app.inject({
      method: "GET",
      url: "/vehicles?status=service",
      headers: auth(adminToken),
    });
    assert.equal(service.statusCode, 200);
    assert.ok(service.json().data.some((v: { id: number }) => v.id === serviceId));
  });

  test("GET /vehicles/:id returns detail with gallery and rates", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/vehicles/${availableId}`,
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const row = res.json().data;
    assert.equal(row.id, availableId);
    assert.equal(row.dailyRate, 1200);
    assert.equal(row.monthlyRate, 24000);
    assert.deepEqual(row.gallery, []);
    assert.equal(row.currentRental, null);
  });

  test("GET /vehicles/:id returns 404 when missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vehicles/999999999",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 404);
  });

  test("GET /vehicles/:id is forbidden without vehicles.read", async () => {
    const noPermEmail = `veh-none-${run}@example.test`;
    await seedUser(noPermEmail, "veh-none-pass-123", `veh_none_${run}`, []);
    const token = await login({ email: noPermEmail, password: "veh-none-pass-123" });
    const res = await app.inject({
      method: "GET",
      url: `/vehicles/${availableId}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 403);
  });

  test("vehicle photo upload/delete and primary image projection", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const boundary = "----vehBoundary";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="car.png"',
      "Content-Type: image/png",
      "",
      png.toString("binary"),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const upload = await app.inject({
      method: "POST",
      url: `/vehicles/${availableId}/photos`,
      headers: {
        ...auth(adminToken),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(body, "binary"),
    });
    assert.equal(upload.statusCode, 201, upload.body);
    const photo = upload.json().data;
    assert.ok(photo.id);
    assert.equal(photo.isPrimary, true);
    assert.match(photo.url, new RegExp(`^/vehicles/${availableId}/photos/`));

    const list = await app.inject({
      method: "GET",
      url: `/vehicles/${availableId}`,
      headers: auth(adminToken),
    });
    assert.equal(list.json().data.primaryImage.id, photo.id);
    assert.equal(list.json().data.gallery.length, 1);

    const stream = await app.inject({
      method: "GET",
      url: photo.url,
      headers: auth(adminToken),
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.headers["content-type"] ?? "", /image/);

    const del = await app.inject({
      method: "DELETE",
      url: `/vehicles/${availableId}/photos/${photo.id}`,
      headers: auth(adminToken),
    });
    assert.equal(del.statusCode, 200);

    const after = await app.inject({
      method: "GET",
      url: `/vehicles/${availableId}`,
      headers: auth(adminToken),
    });
    assert.equal(after.json().data.primaryImage, null);
    assert.equal(after.json().data.gallery.length, 0);
  });

  test("pricing fields validate as non-negative integers", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: { modelId, vin: `VIN-${run}-BADRATE`, dailyRate: -1 },
    });
    assert.equal(bad.statusCode, 400);
  });
}
