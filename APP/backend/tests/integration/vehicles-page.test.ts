import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * Vehicles page backend tests (create/search/prices/deactivate/legacy model).
 * Requires RUN_INTEGRATION=true and a disposable DATABASE_URL.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test(
    "vehicles page integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)",
    {
      skip: true,
    },
  );
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = {
    email: `veh-admin-${run}@example.test`,
    password: "veh-admin-pass-123",
  };
  const reader = {
    email: `veh-reader-${run}@example.test`,
    password: "veh-reader-pass-123",
  };
  let adminToken = "";
  let readerToken = "";
  let modelId = 0;
  let legacyVehicleId = 0;
  let directNameId = 0;
  let availableId = 0;
  let rentedId = 0;
  let serviceId = 0;
  let priceTargetId = 0;
  let deactivateTargetId = 0;

  const ADMIN_PERMS = ["vehicles.read", "vehicles.manage", "vehicle_models.read"];

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
      payload: { companyId: await testCompanyId(prisma), ...payload },
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data;
  }

  async function setVehicleStatus(id: number, operationalStatus: "rented" | "service") {
    const res = await app.inject({
      method: "PUT",
      url: `/vehicles/${id}`,
      headers: auth(adminToken),
      payload: { operationalStatus },
    });
    assert.equal(res.statusCode, 200, res.body);
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
      data: { code: `VEH-${run}`, name: `Patrol Platinum ${run}` },
    });
    modelId = model.id;

    legacyVehicleId = (
      await createVehicle({
        modelId,
        vin: `VIN-${run}-LEG`,
        plateNumber: `D ${run}00`,
        modelYear: 2022,
        color: "Black",
        dailyRate: 500,
        monthlyRate: 9000,
      })
    ).id;

    directNameId = (
      await createVehicle({
        vehicleName: "Toyota Land Cruiser",
        plateNumber: `D ${run}01`,
        modelYear: 2024,
        color: "White",
        dailyRate: 1200,
        monthlyRate: 24000,
      })
    ).id;
    availableId = directNameId;

    rentedId = (
      await setVehicleStatus(
        (
          await createVehicle({
            vehicleName: "Nissan Patrol",
            vin: `VIN-${run}-RT`,
            plateNumber: `D ${run}02`,
            dailyRate: 1000,
            monthlyRate: 20000,
          })
        ).id,
        "rented",
      )
    ).id;

    serviceId = (
      await setVehicleStatus(
        (
          await createVehicle({
            vehicleName: "Ford Explorer",
            vin: `VIN-${run}-SV`,
            plateNumber: `D ${run}03`,
          })
        ).id,
        "service",
      )
    ).id;

    priceTargetId = (
      await createVehicle({
        vehicleName: "BMW 530i",
        plateNumber: `D ${run}04`,
        dailyRate: 600,
        monthlyRate: 11000,
      })
    ).id;

    deactivateTargetId = (
      await createVehicle({
        vehicleName: "Mercedes GLC",
        plateNumber: `D ${run}05`,
        dailyRate: 900,
        monthlyRate: 17000,
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

  test("POST /vehicles is forbidden without vehicles.manage", async () => {
    const forbidden = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(readerToken),
      payload: { companyId: await testCompanyId(prisma), vehicleName: "Blocked Car", plateNumber: `D ${run}99` },
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
    assert.deepEqual(Object.keys(json.meta).sort(), [
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
    const row = json.data.find((v: { id: number }) => v.id === availableId);
    assert.ok(row);
    assert.equal(row.displayName, "Toyota Land Cruiser");
    assert.equal(row.vehicleName, "Toyota Land Cruiser");
    assert.equal(row.plateNumber, `D ${run}01`);
    assert.equal(row.dailyRate, 1200);
    assert.equal(row.monthlyRate, 24000);
    assert.equal(row.operationalStatus, "available");
    assert.equal(row.model, null);
    assert.equal(row.primaryImage, null);
    assert.equal(row.currentRental, null);
    assert.equal("gallery" in row, false);
  });

  test("legacy model-linked vehicle remains readable and listable", async () => {
    const detail = await app.inject({
      method: "GET",
      url: `/vehicles/${legacyVehicleId}`,
      headers: auth(adminToken),
    });
    assert.equal(detail.statusCode, 200);
    const row = detail.json().data;
    assert.equal(row.displayName, `Patrol Platinum ${run} 2022`);
    assert.equal(row.modelId, modelId);
    assert.equal(row.model.name, `Patrol Platinum ${run}`);
    assert.equal(row.vehicleName, null);

    const list = await app.inject({
      method: "GET",
      url: `/vehicles?search=Patrol`,
      headers: auth(adminToken),
    });
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().data.some((v: { id: number }) => v.id === legacyVehicleId));
  });

  test("GET /vehicles status filters", async () => {
    const available = await app.inject({
      method: "GET",
      url: "/vehicles?status=available",
      headers: auth(adminToken),
    });
    assert.equal(available.statusCode, 200);
    assert.ok(
      available
        .json()
        .data.every(
          (v: { operationalStatus: string }) => v.operationalStatus === "available",
        ),
    );

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

  test("GET /vehicles search matches direct vehicleName", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vehicles?search=Land",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().data.some((v: { id: number }) => v.id === directNameId));
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
      payload: { companyId: await testCompanyId(prisma), vehicleName: "Bad Rate Car", vin: `VIN-${run}-BADRATE`, dailyRate: -1 },
    });
    assert.equal(bad.statusCode, 422);
  });

  test("POST /vehicles creates vehicle with direct vehicleName", async () => {
    const created = await createVehicle({
      vehicleName: "Porsche Cayenne",
      vin: `VIN-${run}-NEW`,
      plateNumber: `D ${run}99`,
      modelYear: 2025,
      color: "White",
      dailyRate: 900,
      monthlyRate: 18000,
    });
    assert.equal(created.vehicleName, "Porsche Cayenne");
    assert.equal(created.modelId, null);
    assert.equal(created.operationalStatus, "available");
    assert.equal(created.isActive, true);
    assert.equal(created.plateNumber, `D ${run}99`);
    assert.equal(created.dailyRate, 900);
    assert.equal(created.monthlyRate, 18000);
  });

  test("POST /vehicles accepts legacy modelId without vehicleName", async () => {
    const created = await createVehicle({
      modelId,
      vin: `VIN-${run}-MODELONLY`,
      plateNumber: `D ${run}97`,
    });
    assert.equal(created.modelId, modelId);
    assert.equal(created.vehicleName, null);
    assert.equal(created.operationalStatus, "available");
  });

  test("POST /vehicles succeeds when modelId property is omitted entirely", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: {
       companyId: await testCompanyId(prisma),
        vehicleName: "Toyota Land Cruiser",
        modelYear: 2025,
        plateNumber: `D ${run}OMIT`,
        color: "White",
        dailyRate: 750,
        monthlyRate: 14500,
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    const row = res.json().data;
    assert.equal(row.vehicleName, "Toyota Land Cruiser");
    assert.equal(row.modelId, null);
    assert.equal(row.operationalStatus, "available");
    assert.equal(row.isActive, true);
    assert.equal(row.plateNumber, `D ${run}OMIT`);
    assert.equal(row.dailyRate, 750);
    assert.equal(row.monthlyRate, 14500);
    assert.equal("modelId" in (JSON.parse(res.body).data ?? {}), true);
    assert.equal(JSON.parse(res.body).data.modelId, null);

    const detail = await app.inject({
      method: "GET",
      url: `/vehicles/${row.id}`,
      headers: auth(adminToken),
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().data.displayName, "Toyota Land Cruiser");
  });

  test("POST /vehicles rejects modelId:null without vehicleName", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: { modelId: null, vin: `VIN-${run}-NULLMODEL` },
    });
    assert.equal(res.statusCode, 422);
  });

  test("POST /vehicles rejects create without vehicleName or modelId", async () => {
    const neither = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: { vin: `VIN-${run}-NEITHER` },
    });
    assert.equal(neither.statusCode, 422);
  });

  test("POST /vehicles succeeds without VehicleModel and does not auto-create one", async () => {
    const modelCountBefore = await prisma.vehicleModel.count();
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: {
       companyId: await testCompanyId(prisma),
        vehicleName: "First Fleet Car",
        plateNumber: `D ${run}FIRST`,
        modelYear: 2026,
        color: "White",
        dailyRate: 500,
        monthlyRate: 9500,
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    const row = res.json().data;
    assert.equal(row.vehicleName, "First Fleet Car");
    assert.equal(row.modelId, null);
    assert.equal(row.operationalStatus, "available");
    assert.equal(row.isActive, true);
    assert.equal(await prisma.vehicleModel.count(), modelCountBefore);
  });

  test("POST /vehicles ignores client operationalStatus attempts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: {
       companyId: await testCompanyId(prisma),
        vehicleName: "Ignored Status Car",
        vin: `VIN-${run}-IGN2`,
        plateNumber: `D ${run}88`,
        operationalStatus: "rented",
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().data.operationalStatus, "available");
  });

  test("POST /vehicles rejects duplicate plate number", async () => {
    const duplicate = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: {
       companyId: await testCompanyId(prisma),
        vehicleName: "Duplicate Plate",
        vin: `VIN-${run}-DUP1`,
        plateNumber: `D ${run}01`,
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json().error.code, "CONFLICT");
  });

  test("POST /vehicles rejects inactive model reference", async () => {
    const inactiveModel = await prisma.vehicleModel.create({
      data: {
        code: `VEH-INACTIVE-${run}`,
        name: `Inactive Model ${run}`,
        isActive: false,
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(adminToken),
      payload: { modelId: inactiveModel.id, vin: `VIN-${run}-INACTIVE` },
    });
    assert.equal(res.statusCode, 422);
  });

  test("GET /vehicles sort whitelist orders by dailyRate asc with nulls first", async () => {
    const zeroRateId = (
      await createVehicle({
        vehicleName: "Zero Rate Asc",
        plateNumber: `D ${run}ZR`,
        dailyRate: 0,
      })
    ).id;
    const res = await app.inject({
      method: "GET",
      url: "/vehicles?sort=dailyRate:asc&pageSize=100&active=true",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const rows = res.json().data as Array<{ id: number; dailyRate: number | null }>;
    const rates = rows.map((v) => v.dailyRate);
    for (let i = 1; i < rates.length; i++) {
      const prev = rates[i - 1] ?? -1;
      const curr = rates[i] ?? -1;
      assert.ok(curr >= prev, `rate ${curr} should be >= ${prev}`);
    }
    const zeroIndex = rows.findIndex((v) => v.id === zeroRateId);
    const firstPositiveIndex = rows.findIndex((v) => (v.dailyRate ?? 0) > 0);
    if (firstPositiveIndex >= 0) {
      assert.ok(zeroIndex < firstPositiveIndex || zeroIndex === 0);
    }
  });

  test("GET /vehicles sort whitelist orders by dailyRate desc with nulls last", async () => {
    await createVehicle({
      vehicleName: "Zero Rate Desc",
      plateNumber: `D ${run}ZD`,
      dailyRate: 0,
    });
    const res = await app.inject({
      method: "GET",
      url: "/vehicles?sort=dailyRate:desc&pageSize=100&active=true",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const rates = res.json().data.map((v: { dailyRate: number | null }) => v.dailyRate);
    for (let i = 1; i < rates.length; i++) {
      const prev = rates[i - 1] ?? Number.MAX_SAFE_INTEGER;
      const curr = rates[i] ?? Number.MAX_SAFE_INTEGER;
      assert.ok(curr <= prev, `rate ${curr} should be <= ${prev}`);
    }
    const lastNonNull = rates.filter((r: number | null) => r != null).at(-1);
    if (rates.includes(null)) {
      assert.ok(rates.at(-1) === null || lastNonNull === 0);
    }
  });

  test("GET /vehicles/filter-options returns active fleet types", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vehicles/filter-options",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const options = res.json().data as Array<{ value: string; label: string }>;
    assert.ok(options.some((o) => o.value === "Toyota Land Cruiser"));
    assert.ok(options.some((o) => o.label.includes(`Patrol Platinum ${run}`)));
  });

  test("GET /vehicles vehicleType filter matches direct vehicleName", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/vehicles?vehicleType=${encodeURIComponent("Toyota Land Cruiser")}`,
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    assert.ok(
      res
        .json()
        .data.every(
          (v: { vehicleName: string | null }) => v.vehicleName === "Toyota Land Cruiser",
        ),
    );
    assert.ok(res.json().data.some((v: { id: number }) => v.id === directNameId));
  });

  test("GET /vehicles vehicleType filter matches legacy model name", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/vehicles?vehicleType=${encodeURIComponent(`Patrol Platinum ${run}`)}`,
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().data.some((v: { id: number }) => v.id === legacyVehicleId));
  });

  test("PUT /vehicles/:id rejects default-rate update when rented", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/vehicles/${rentedId}`,
      headers: auth(adminToken),
      payload: { dailyRate: 1 },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, "CONFLICT");
  });

  test("POST /vehicles/:id/deactivate rejects rented vehicle", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/vehicles/${rentedId}/deactivate`,
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, "CONFLICT");
  });

  test("PUT /vehicles/:id price update does not change isActive", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/vehicles/${priceTargetId}`,
      headers: auth(adminToken),
    });
    const priorActive = before.json().data.isActive;

    const updated = await app.inject({
      method: "PUT",
      url: `/vehicles/${priceTargetId}`,
      headers: auth(adminToken),
      payload: { dailyRate: 650 },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().data.isActive, priorActive);
  });

  test("PUT /vehicles/:id price update succeeds with vehicles.manage", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/vehicles/${priceTargetId}`,
      headers: auth(adminToken),
    });
    const prior = before.json().data;

    const updated = await app.inject({
      method: "PUT",
      url: `/vehicles/${priceTargetId}`,
      headers: auth(adminToken),
      payload: { dailyRate: 700, monthlyRate: 13000 },
    });
    assert.equal(updated.statusCode, 200);
    const row = updated.json().data;
    assert.equal(row.dailyRate, 700);
    assert.equal(row.monthlyRate, 13000);
    assert.equal(row.operationalStatus, prior.operationalStatus);
    assert.equal(row.plateNumber, prior.plateNumber);
    assert.equal(row.vehicleName, prior.vehicleName);
  });

  test("PUT /vehicles/:id price update is forbidden with vehicles.read only", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/vehicles/${priceTargetId}`,
      headers: auth(readerToken),
      payload: { dailyRate: 1 },
    });
    assert.equal(res.statusCode, 403);
  });

  test("PUT /vehicles/:id rejects invalid rate", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/vehicles/${priceTargetId}`,
      headers: auth(adminToken),
      payload: { monthlyRate: -5 },
    });
    assert.equal(res.statusCode, 422);
  });

  test("POST /vehicles/:id/deactivate removes vehicle from active fleet safely", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/vehicles/${deactivateTargetId}`,
      headers: auth(adminToken),
    });
    const priorStatus = before.json().data.operationalStatus;

    const deactivated = await app.inject({
      method: "POST",
      url: `/vehicles/${deactivateTargetId}/deactivate`,
      headers: auth(adminToken),
    });
    assert.equal(deactivated.statusCode, 200);
    assert.equal(deactivated.json().data.isActive, false);
    assert.equal(deactivated.json().data.operationalStatus, priorStatus);

    const activeList = await app.inject({
      method: "GET",
      url: "/vehicles?active=true",
      headers: auth(adminToken),
    });
    assert.equal(activeList.statusCode, 200);
    assert.equal(
      activeList.json().data.some((v: { id: number }) => v.id === deactivateTargetId),
      false,
    );

    const retiredList = await app.inject({
      method: "GET",
      url: `/vehicles?search=GLC`,
      headers: auth(adminToken),
    });
    assert.equal(retiredList.statusCode, 200);
    assert.ok(
      retiredList.json().data.some((v: { id: number }) => v.id === deactivateTargetId),
    );

    const stillThere = await app.inject({
      method: "GET",
      url: `/vehicles/${deactivateTargetId}`,
      headers: auth(adminToken),
    });
    assert.equal(stillThere.statusCode, 200);

    const dbRow = await prisma.vehicle.findUnique({ where: { id: deactivateTargetId } });
    assert.ok(dbRow);
    assert.equal(dbRow.isActive, false);
  });
}
