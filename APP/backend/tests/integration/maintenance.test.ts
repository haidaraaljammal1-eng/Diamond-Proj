import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * Requires RUN_INTEGRATION=true and TEST_DATABASE_URL pointing at disposable
 * haidara_test — never Development haidara.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "maintenance integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = {
    email: `maint-admin-${run}@example.test`,
    password: "maint-admin-pass-123",
  };
  const reader = {
    email: `maint-reader-${run}@example.test`,
    password: "maint-reader-pass-123",
  };
  const stranger = {
    email: `maint-stranger-${run}@example.test`,
    password: "maint-stranger-pass-123",
  };
  let adminToken = "";
  let readerToken = "";
  let strangerToken = "";
  let availableVehicleId = 0;
  let rentedVehicleId = 0;
  let serviceVehicleId = 0;

  const ADMIN_PERMS = [
    "maintenance.read",
    "maintenance.manage",
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
      payload: { companyId: await testCompanyId(prisma), ...payload },
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data;
  }

  async function setVehicleStatus(id: number, operationalStatus: "available" | "rented" | "service") {
    const res = await app.inject({
      method: "PUT",
      url: `/vehicles/${id}`,
      headers: auth(adminToken),
      payload: { operationalStatus },
    });
    return res;
  }

  async function createMaintenance(payload: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: "/maintenance",
      headers: auth(adminToken),
      payload,
    });
    return res;
  }

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("maintenance integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(admin.email, admin.password, `maint_admin_${run}`, ADMIN_PERMS);
    await seedUser(reader.email, reader.password, `maint_reader_${run}`, ["maintenance.read"]);
    await seedUser(stranger.email, stranger.password, `maint_stranger_${run}`, ["vehicles.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);
    strangerToken = await login(stranger);

    availableVehicleId = (
      await createVehicle({
        vehicleName: "Toyota Corolla",
        plateNumber: `M ${run} AV`,
        modelYear: 2025,
        color: "White",
      })
    ).id;

    rentedVehicleId = (
      await createVehicle({
        vehicleName: "Toyota Corolla Twin",
        plateNumber: `M ${run} RT`,
        modelYear: 2025,
        color: "White",
      })
    ).id;
    await setVehicleStatus(rentedVehicleId, "rented");

    serviceVehicleId = (
      await createVehicle({
        vehicleName: "Nissan Patrol",
        plateNumber: `M ${run} SV`,
        modelYear: 2024,
        color: "Black",
      })
    ).id;
    const serviceRes = await setVehicleStatus(serviceVehicleId, "service");
    assert.equal(serviceRes.statusCode, 200, serviceRes.body);
  });

  after(async () => {
    await app.close();
  });

  test("AVAILABLE + now creates IN_SERVICE and sets vehicle SERVICE", async () => {
    const res = await createMaintenance({
      vehicleId: availableVehicleId,
      issueDescription: "Abnormal vibration while braking.",
      maintenanceType: "mechanical",
      startMode: "now",
    });
    assert.equal(res.statusCode, 201, res.body);
    const body = res.json().data;
    assert.equal(body.status, "in_service");
    assert.equal(body.vehicle.operationalStatus, "service");
    assert.ok(body.startedAt);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: availableVehicleId },
    });
    assert.equal(vehicle.operationalStatus, "SERVICE");
  });

  test("GET /maintenance list includes the Vehicle projection used by cards", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/maintenance?status=in_service",
      headers: auth(adminToken),
    });
    assert.equal(listRes.statusCode, 200, listRes.body);
    const row = listRes.json().data.find(
      (order: { vehicleId: number }) => order.vehicleId === availableVehicleId,
    );
    assert.ok(row);
    assert.ok(row.vehicle);
    assert.equal(row.vehicle.id, availableVehicleId);
    assert.equal(typeof row.vehicle.displayName, "string");
    assert.ok(row.vehicle.displayName.length > 0);
    assert.equal(typeof row.vehicle.plateNumber, "string");
    assert.ok("primaryImageUrl" in row.vehicle);
    assert.ok("modelYear" in row.vehicle);
    assert.ok("color" in row.vehicle);
  });

  test("AVAILABLE + scheduled keeps vehicle AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Honda Civic",
      plateNumber: `M ${run} SC`,
      modelYear: 2023,
      color: "Silver",
    });
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Periodic inspection due next week.",
      maintenanceType: "periodic",
      startMode: "scheduled",
      scheduledAt,
    });
    assert.equal(res.statusCode, 201, res.body);
    const body = res.json().data;
    assert.equal(body.status, "scheduled");
    assert.equal(body.vehicle.operationalStatus, "available");

    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    assert.equal(row.operationalStatus, "AVAILABLE");
  });

  test("scheduled maintenance can be started when vehicle remains AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Kia Sportage",
      plateNumber: `M ${run} ST`,
      modelYear: 2024,
      color: "Blue",
    });
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "AC not cooling properly.",
      maintenanceType: "air_conditioning",
      startMode: "scheduled",
      scheduledAt,
    });
    assert.equal(created.statusCode, 201, created.body);
    const orderId = created.json().data.id as number;

    const startRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/start`,
      headers: auth(adminToken),
    });
    assert.equal(startRes.statusCode, 200, startRes.body);
    const started = startRes.json().data;
    assert.equal(started.status, "in_service");
    assert.equal(started.vehicle.operationalStatus, "service");
  });

  test("scheduled maintenance cannot start when vehicle became RENTED", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Ford Explorer",
      plateNumber: `M ${run} RD`,
      modelYear: 2022,
      color: "Gray",
    });
    const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Tire wear inspection.",
      maintenanceType: "tires",
      startMode: "scheduled",
      scheduledAt,
    });
    assert.equal(created.statusCode, 201, created.body);
    const orderId = created.json().data.id as number;

    const manualRent = await setVehicleStatus(vehicle.id, "rented");
    assert.equal(manualRent.statusCode, 409, manualRent.body);
    assert.equal(
      manualRent.json().error.context.reason,
      "VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS",
    );

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { operationalStatus: "RENTED" },
    });

    const startRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/start`,
      headers: auth(adminToken),
    });
    assert.equal(startRes.statusCode, 409, startRes.body);
    assert.equal(
      startRes.json().error.context.reason,
      "VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE",
    );
  });

  test("RENTED vehicle cannot be added to immediate maintenance", async () => {
    const res = await createMaintenance({
      vehicleId: rentedVehicleId,
      issueDescription: "Should be rejected.",
      maintenanceType: "other",
      startMode: "now",
    });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(
      res.json().error.context.reason,
      "VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE",
    );
  });

  test("SERVICE vehicle cannot receive another active maintenance order", async () => {
    const res = await createMaintenance({
      vehicleId: serviceVehicleId,
      issueDescription: "Duplicate service attempt.",
      maintenanceType: "other",
      startMode: "now",
    });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(
      res.json().error.context.reason,
      "VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE",
    );
  });

  test("IN_SERVICE to READY_FOR_PICKUP keeps vehicle SERVICE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Mazda 6",
      plateNumber: `M ${run} RDY`,
      modelYear: 2021,
      color: "Red",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Brake pad replacement.",
      maintenanceType: "mechanical",
      startMode: "now",
    });
    assert.equal(created.statusCode, 201, created.body);
    const orderId = created.json().data.id as number;

    const readyRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });
    assert.equal(readyRes.statusCode, 200, readyRes.body);
    const ready = readyRes.json().data;
    assert.equal(ready.status, "ready_for_pickup");
    assert.equal(ready.vehicle.operationalStatus, "service");
    assert.ok(ready.readyAt);
  });

  test("READY_FOR_PICKUP to COMPLETED returns vehicle AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Hyundai Tucson",
      plateNumber: `M ${run} CMP`,
      modelYear: 2020,
      color: "White",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Body paint touch-up.",
      maintenanceType: "body",
      startMode: "now",
    });
    const orderId = created.json().data.id as number;
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });

    const completeRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/complete`,
      headers: auth(adminToken),
    });
    assert.equal(completeRes.statusCode, 200, completeRes.body);
    const completed = completeRes.json().data;
    assert.equal(completed.status, "completed");
    assert.equal(completed.vehicle.operationalStatus, "available");
    assert.ok(completed.completedAt);

    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    assert.equal(row.operationalStatus, "AVAILABLE");
  });

  test("SCHEDULED to CANCELLED keeps vehicle AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Chevrolet Tahoe",
      plateNumber: `M ${run} CN`,
      modelYear: 2019,
      color: "Black",
    });
    const scheduledAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Cancelled appointment.",
      maintenanceType: "periodic",
      startMode: "scheduled",
      scheduledAt,
    });
    const orderId = created.json().data.id as number;

    const cancelRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/cancel`,
      headers: auth(adminToken),
    });
    assert.equal(cancelRes.statusCode, 200, cancelRes.body);
    assert.equal(cancelRes.json().data.status, "cancelled");

    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    assert.equal(row.operationalStatus, "AVAILABLE");
  });

  test("issueDescription is required", async () => {
    const res = await createMaintenance({
      vehicleId: availableVehicleId,
      issueDescription: "   ",
      maintenanceType: "other",
      startMode: "now",
    });
    assert.equal(res.statusCode, 422, res.body);
  });

  test("scheduledAt is required when startMode is scheduled", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Volkswagen Golf",
      plateNumber: `M ${run} NO`,
      modelYear: 2018,
      color: "Blue",
    });
    const res = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Missing schedule date.",
      maintenanceType: "other",
      startMode: "scheduled",
    });
    assert.equal(res.statusCode, 422, res.body);
  });

  test("duplicate active maintenance is rejected", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Peugeot 3008",
      plateNumber: `M ${run} DUP`,
      modelYear: 2022,
      color: "Gray",
    });
    const first = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "First active order.",
      maintenanceType: "electrical",
      startMode: "now",
    });
    assert.equal(first.statusCode, 201, first.body);

    const second = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Second active order.",
      maintenanceType: "electrical",
      startMode: "now",
    });
    assert.equal(second.statusCode, 409, second.body);
    assert.equal(second.json().error.context.reason, "ACTIVE_MAINTENANCE_EXISTS");
  });

  test("summary and overdue filter work", async () => {
    const summaryRes = await app.inject({
      method: "GET",
      url: "/maintenance/summary",
      headers: auth(adminToken),
    });
    assert.equal(summaryRes.statusCode, 200, summaryRes.body);
    const summary = summaryRes.json().data;
    assert.ok(summary.inService >= 1);
    assert.ok(typeof summary.overdue === "number");

    const overdueRes = await app.inject({
      method: "GET",
      url: "/maintenance?status=overdue",
      headers: auth(adminToken),
    });
    assert.equal(overdueRes.statusCode, 200, overdueRes.body);
    assert.ok(Array.isArray(overdueRes.json().data));
  });

  test("unauthorized user cannot manage maintenance", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/maintenance",
      headers: auth(readerToken),
      payload: {
        vehicleId: availableVehicleId,
        issueDescription: "Reader should not create.",
        maintenanceType: "other",
        startMode: "now",
      },
    });
    assert.equal(res.statusCode, 403, res.body);
  });

  test("user without maintenance.read cannot list or open orders", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/maintenance",
      headers: auth(strangerToken),
    });
    assert.equal(listRes.statusCode, 403, listRes.body);

    const detailRes = await app.inject({
      method: "GET",
      url: "/maintenance/1",
      headers: auth(strangerToken),
    });
    assert.equal(detailRes.statusCode, 403, detailRes.body);
  });

  test("create maintenance without cost succeeds with null cost", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Cost Null Vehicle",
      plateNumber: `M ${run} CN0`,
      modelYear: 2024,
      color: "White",
    });
    const res = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "No cost yet.",
      maintenanceType: "mechanical",
      startMode: "now",
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().data.cost, null);
  });

  test("create maintenance with valid cost succeeds", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Cost Set Vehicle",
      plateNumber: `M ${run} CN1`,
      modelYear: 2024,
      color: "Silver",
    });
    const res = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Known workshop quote received.",
      maintenanceType: "mechanical",
      startMode: "now",
      cost: 850,
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().data.cost, 850);
  });

  test("negative cost is rejected", async () => {
    const res = await createMaintenance({
      vehicleId: availableVehicleId,
      issueDescription: "Invalid cost.",
      maintenanceType: "other",
      startMode: "now",
      cost: -10,
    });
    assert.equal(res.statusCode, 422, res.body);
  });

  test("active maintenance cost can be updated via PATCH", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Cost Patch Vehicle",
      plateNumber: `M ${run} CP`,
      modelYear: 2023,
      color: "Blue",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Awaiting invoice.",
      maintenanceType: "electrical",
      startMode: "now",
    });
    assert.equal(created.statusCode, 201, created.body);
    const orderId = created.json().data.id as number;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/maintenance/${orderId}`,
      headers: auth(adminToken),
      payload: { cost: 1290 },
    });
    assert.equal(patchRes.statusCode, 200, patchRes.body);
    assert.equal(patchRes.json().data.cost, 1290);
  });

  test("cost remains stored after completing maintenance", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Cost Complete Vehicle",
      plateNumber: `M ${run} CC`,
      modelYear: 2022,
      color: "Gray",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Brake service with invoice.",
      maintenanceType: "mechanical",
      startMode: "now",
      cost: 640,
    });
    const orderId = created.json().data.id as number;
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });
    const completeRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/complete`,
      headers: auth(adminToken),
    });
    assert.equal(completeRes.statusCode, 200, completeRes.body);
    assert.equal(completeRes.json().data.cost, 640);
    assert.equal(completeRes.json().data.status, "completed");
  });

  test("completed maintenance appears in history list with cost", async () => {
    const vehicle = await createVehicle({
      vehicleName: "History Vehicle",
      plateNumber: `M ${run} HS`,
      modelYear: 2021,
      color: "Red",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "History record test.",
      maintenanceType: "tires",
      startMode: "now",
      cost: 500,
      workshopName: "Quick Tyres",
    });
    const orderId = created.json().data.id as number;
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/complete`,
      headers: auth(adminToken),
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/maintenance?status=completed",
      headers: auth(adminToken),
    });
    assert.equal(listRes.statusCode, 200, listRes.body);
    const row = listRes.json().data.find((o: { id: number }) => o.id === orderId);
    assert.ok(row);
    assert.equal(row.status, "completed");
    assert.equal(row.cost, 500);
    assert.equal(row.workshopName, "Quick Tyres");
    assert.equal(row.issueDescription, "History record test.");
    assert.ok(row.vehicle);
    assert.equal(row.vehicle.id, vehicle.id);
    assert.equal(row.vehicle.plateNumber, `M ${run} HS`);
    assert.equal(row.vehicle.modelYear, 2021);
    assert.equal(row.vehicle.color, "Red");
    assert.match(String(row.vehicle.displayName), /History Vehicle/);
  });

  test("null costs do not break summary aggregation", async () => {
    const summaryRes = await app.inject({
      method: "GET",
      url: "/maintenance/summary",
      headers: auth(adminToken),
    });
    assert.equal(summaryRes.statusCode, 200, summaryRes.body);
    const summary = summaryRes.json().data;
    assert.ok(typeof summary.totalCost === "number");
    assert.ok(summary.totalCost >= 0);
  });

  test("PATCH on completed maintenance is rejected", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Immutable Vehicle",
      plateNumber: `M ${run} IM`,
      modelYear: 2020,
      color: "Black",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Completed immutability.",
      maintenanceType: "other",
      startMode: "now",
    });
    const orderId = created.json().data.id as number;
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/complete`,
      headers: auth(adminToken),
    });

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/maintenance/${orderId}`,
      headers: auth(adminToken),
      payload: { cost: 999 },
    });
    assert.equal(patchRes.statusCode, 409, patchRes.body);
    assert.equal(
      patchRes.json().error.context.reason,
      "MAINTENANCE_COMPLETED_IMMUTABLE",
    );
  });

  test("IN_SERVICE maintenance blocks manual SERVICE to AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Block Available Vehicle",
      plateNumber: `M ${run} BA`,
      modelYear: 2024,
      color: "White",
    });
    await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Still in workshop.",
      maintenanceType: "mechanical",
      startMode: "now",
    });

    const res = await setVehicleStatus(vehicle.id, "available");
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(
      res.json().error.context.reason,
      "VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS",
    );
  });

  test("READY_FOR_PICKUP maintenance blocks manual SERVICE to AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Block Ready Vehicle",
      plateNumber: `M ${run} BR`,
      modelYear: 2024,
      color: "Silver",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Ready but not picked up.",
      maintenanceType: "body",
      startMode: "now",
    });
    const orderId = created.json().data.id as number;
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });

    const res = await setVehicleStatus(vehicle.id, "available");
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(
      res.json().error.context.reason,
      "VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS",
    );
  });

  test("completing maintenance correctly releases SERVICE to AVAILABLE", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Release Vehicle",
      plateNumber: `M ${run} RL`,
      modelYear: 2023,
      color: "Blue",
    });
    const created = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: "Release after pickup.",
      maintenanceType: "periodic",
      startMode: "now",
    });
    const orderId = created.json().data.id as number;
    await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/ready`,
      headers: auth(adminToken),
    });
    const completeRes = await app.inject({
      method: "POST",
      url: `/maintenance/${orderId}/complete`,
      headers: auth(adminToken),
    });
    assert.equal(completeRes.statusCode, 200, completeRes.body);

    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    assert.equal(row.operationalStatus, "AVAILABLE");
  });

  test("manual AVAILABLE to SERVICE without maintenance order still works", async () => {
    const vehicle = await createVehicle({
      vehicleName: "Manual Service Vehicle",
      plateNumber: `M ${run} MS`,
      modelYear: 2022,
      color: "Gray",
    });
    const res = await setVehicleStatus(vehicle.id, "service");
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().data.operationalStatus, "service");

    const orders = await prisma.maintenanceOrder.findMany({
      where: { vehicleId: vehicle.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    assert.equal(orders.length, 0);
  });

  // ---------------------------------------------------------------------------
  // Operating company (Phase A) — derived from the Vehicle, never stored on the
  // MaintenanceOrder. Vehicle.companyId is write-once, so the relation is the
  // authoritative answer.
  // ---------------------------------------------------------------------------

  async function createCompanyOrder(code: "UNIQUE" | "ELITE", suffix: string) {
    const vehicle = await createVehicle({
      companyId: await testCompanyId(prisma, code),
      vehicleName: `Company ${code} ${suffix}`,
      plateNumber: `M ${run} ${suffix}`,
      modelYear: 2024,
      color: "White",
    });
    const res = await createMaintenance({
      vehicleId: vehicle.id,
      issueDescription: `Company scoped order ${code} ${suffix}.`,
      maintenanceType: code === "ELITE" ? "electrical" : "mechanical",
      startMode: "now",
    });
    assert.equal(res.statusCode, 201, res.body);
    return { vehicleId: vehicle.id as number, order: res.json().data };
  }

  test("maintenance DTO carries the owning company from the Vehicle", async () => {
    const unique = await createCompanyOrder("UNIQUE", "OCU");
    const elite = await createCompanyOrder("ELITE", "OCE");

    assert.equal(unique.order.vehicle.company.code, "UNIQUE");
    assert.equal(elite.order.vehicle.company.code, "ELITE");
    for (const company of [unique.order.vehicle.company, elite.order.vehicle.company]) {
      assert.equal(typeof company.id, "number");
      assert.equal(typeof company.displayName, "string");
      assert.equal(typeof company.accentColor, "string");
      assert.equal("legalNameEn" in company, false);
    }

    const detail = await app.inject({
      method: "GET",
      url: `/maintenance/${elite.order.id}`,
      headers: auth(readerToken),
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().data.vehicle.company.code, "ELITE");
  });

  test("MaintenanceOrder stores no company of its own", async () => {
    const { order } = await createCompanyOrder("ELITE", "OCN");
    const row = await prisma.maintenanceOrder.findUniqueOrThrow({
      where: { id: order.id as number },
    });
    assert.equal("companyId" in row, false);

    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'maintenance_orders'",
    );
    assert.equal(
      columns.some((column) => column.column_name.toLowerCase().includes("company")),
      false,
    );
  });

  test("companyId filters maintenance through the Vehicle relation", async () => {
    const unique = await createCompanyOrder("UNIQUE", "OCFU");
    const elite = await createCompanyOrder("ELITE", "OCFE");
    const uniqueId = await testCompanyId(prisma, "UNIQUE");
    const eliteId = await testCompanyId(prisma, "ELITE");

    const uniqueRes = await app.inject({
      method: "GET",
      url: `/maintenance?status=in_service&pageSize=100&companyId=${uniqueId}`,
      headers: auth(readerToken),
    });
    assert.equal(uniqueRes.statusCode, 200, uniqueRes.body);
    const uniqueRows = uniqueRes.json().data as Array<{
      id: number;
      vehicle: { company: { code: string } };
    }>;
    assert.ok(uniqueRows.length > 0);
    assert.ok(uniqueRows.every((row) => row.vehicle.company.code === "UNIQUE"));
    assert.ok(uniqueRows.some((row) => row.id === unique.order.id));
    assert.equal(uniqueRows.some((row) => row.id === elite.order.id), false);

    const eliteRes = await app.inject({
      method: "GET",
      url: `/maintenance?status=in_service&pageSize=100&companyId=${eliteId}`,
      headers: auth(readerToken),
    });
    assert.equal(eliteRes.statusCode, 200, eliteRes.body);
    const eliteRows = eliteRes.json().data as Array<{
      id: number;
      vehicle: { company: { code: string } };
    }>;
    assert.ok(eliteRows.every((row) => row.vehicle.company.code === "ELITE"));
    assert.ok(eliteRows.some((row) => row.id === elite.order.id));
    assert.equal(eliteRows.some((row) => row.id === unique.order.id), false);

    const all = await app.inject({
      method: "GET",
      url: "/maintenance?status=in_service&pageSize=100",
      headers: auth(readerToken),
    });
    const allIds = (all.json().data as Array<{ id: number }>).map((row) => row.id);
    assert.ok(allIds.includes(unique.order.id));
    assert.ok(allIds.includes(elite.order.id));
  });

  test("company composes with status, search and maintenanceType filters", async () => {
    const elite = await createCompanyOrder("ELITE", "OCX");
    const eliteId = await testCompanyId(prisma, "ELITE");
    const uniqueId = await testCompanyId(prisma, "UNIQUE");
    const plate = encodeURIComponent(`M ${run} OCX`);

    const withType = await app.inject({
      method: "GET",
      url: `/maintenance?status=in_service&pageSize=100&companyId=${eliteId}&maintenanceType=electrical`,
      headers: auth(readerToken),
    });
    assert.equal(withType.statusCode, 200, withType.body);
    const typed = withType.json().data as Array<{
      id: number;
      maintenanceType: string;
      vehicle: { company: { code: string } };
    }>;
    assert.ok(typed.some((row) => row.id === elite.order.id));
    assert.ok(
      typed.every(
        (row) =>
          row.maintenanceType === "electrical" && row.vehicle.company.code === "ELITE",
      ),
    );

    const withSearch = await app.inject({
      method: "GET",
      url: `/maintenance?status=in_service&pageSize=100&companyId=${eliteId}&search=${plate}`,
      headers: auth(readerToken),
    });
    assert.equal(withSearch.statusCode, 200, withSearch.body);
    assert.deepEqual(
      (withSearch.json().data as Array<{ id: number }>).map((row) => row.id),
      [elite.order.id],
    );

    // The same search under the other company must return nothing.
    const crossCompany = await app.inject({
      method: "GET",
      url: `/maintenance?status=in_service&pageSize=100&companyId=${uniqueId}&search=${plate}`,
      headers: auth(readerToken),
    });
    assert.equal(crossCompany.statusCode, 200, crossCompany.body);
    assert.equal((crossCompany.json().data as unknown[]).length, 0);

    // Company must not pull an order into a lifecycle status it is not in.
    const completedOnly = await app.inject({
      method: "GET",
      url: `/maintenance?status=completed&pageSize=100&companyId=${eliteId}`,
      headers: auth(readerToken),
    });
    assert.equal(completedOnly.statusCode, 200, completedOnly.body);
    assert.equal(
      (completedOnly.json().data as Array<{ id: number }>).some(
        (row) => row.id === elite.order.id,
      ),
      false,
    );
  });

  test("company filter does not change the maintenance lifecycle", async () => {
    const { vehicleId, order } = await createCompanyOrder("ELITE", "OCL");
    const eliteId = await testCompanyId(prisma, "ELITE");

    await app.inject({
      method: "POST",
      url: `/maintenance/${order.id}/ready`,
      headers: auth(adminToken),
    });
    const completeRes = await app.inject({
      method: "POST",
      url: `/maintenance/${order.id}/complete`,
      headers: auth(adminToken),
    });
    assert.equal(completeRes.statusCode, 200, completeRes.body);
    assert.equal(completeRes.json().data.vehicle.company.code, "ELITE");

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    assert.equal(vehicle.operationalStatus, "AVAILABLE");

    const history = await app.inject({
      method: "GET",
      url: `/maintenance?status=completed&pageSize=100&companyId=${eliteId}`,
      headers: auth(readerToken),
    });
    assert.equal(history.statusCode, 200, history.body);
    const rows = history.json().data as Array<{
      id: number;
      vehicle: { company: { code: string } };
    }>;
    assert.ok(rows.some((row) => row.id === order.id));
    assert.ok(rows.every((row) => row.vehicle.company.code === "ELITE"));
  });
}
