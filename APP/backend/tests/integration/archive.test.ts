import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "archive integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = {
    email: `archive-admin-${run}@example.test`,
    password: "archive-admin-pass-123",
  };
  const reader = {
    email: `archive-reader-${run}@example.test`,
    password: "archive-reader-pass-123",
  };
  let adminToken = "";
  let readerToken = "";
  let vehicleAId = 0;
  let vehicleBId = 0;
  let inactiveVehicleId = 0;

  const ADMIN_PERMS = [
    "archive.read",
    "archive.manage",
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

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("archive integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(admin.email, admin.password, `archive_admin_${run}`, ADMIN_PERMS);
    await seedUser(reader.email, reader.password, `archive_reader_${run}`, ["archive.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);

    vehicleAId = (
      await createVehicle({
        vehicleName: "Archive Test A",
        plateNumber: `AR ${run} A`,
        operationalStatus: "rented",
      })
    ).id;
    vehicleBId = (
      await createVehicle({
        vehicleName: "Archive Test B",
        plateNumber: `AR ${run} B`,
        operationalStatus: "service",
      })
    ).id;
    inactiveVehicleId = (
      await createVehicle({
        vehicleName: "Archive Retired",
        plateNumber: `AR ${run} X`,
      })
    ).id;
    const deactivate = await app.inject({
      method: "POST",
      url: `/vehicles/${inactiveVehicleId}/deactivate`,
      headers: auth(adminToken),
    });
    assert.equal(deactivate.statusCode, 200, deactivate.body);
  });

  after(async () => {
    await app.close();
  });

  test("GET /archive/vehicles returns active fleet vehicles with display metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/archive/vehicles",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    const vehicles = res.json().data as Array<{
      id: number;
      displayName: string;
      plateNumber: string | null;
    }>;
    const a = vehicles.find((v) => v.id === vehicleAId);
    const b = vehicles.find((v) => v.id === vehicleBId);
    const retired = vehicles.find((v) => v.id === inactiveVehicleId);
    assert.ok(a);
    assert.equal(a!.displayName, "Archive Test A");
    assert.equal(a!.plateNumber, `AR ${run} A`);
    assert.ok(b);
    assert.equal(retired, undefined);
  });

  test("POST creates empty archive row with null manual fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    assert.equal(res.statusCode, 201, res.body);
    const row = res.json().data;
    assert.equal(row.vehicleId, vehicleAId);
    assert.equal(row.rowOrder, 1);
    assert.equal(row.kmIn, null);
    assert.equal(row.customerName, null);
    assert.equal(row.salik, null);
    assert.equal(row.remaining, null);
  });

  test("GET rows returns only rows for requested vehicle in rowOrder", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleBId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    assert.equal(first.statusCode, 201);
    const second = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleBId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    assert.equal(second.statusCode, 201);
    const secondRow = second.json().data;
    assert.equal(secondRow.rowOrder, 2);

    const list = await app.inject({
      method: "GET",
      url: `/archive/vehicles/${vehicleBId}/rows`,
      headers: auth(adminToken),
    });
    assert.equal(list.statusCode, 200);
    const rows = list.json().data as Array<{ id: number; rowOrder: number; vehicleId: number }>;
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.rowOrder), [1, 2]);
    assert.ok(rows.every((r) => r.vehicleId === vehicleBId));
  });

  test("PATCH updates one field without overwriting others", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(adminToken),
      payload: { customerName: "Keep Me", salik: 100 },
    });
    assert.equal(create.statusCode, 201);
    const rowId = create.json().data.id;

    const patch = await app.inject({
      method: "PATCH",
      url: `/archive/rows/${rowId}`,
      headers: auth(adminToken),
      payload: { salik: 250 },
    });
    assert.equal(patch.statusCode, 200, patch.body);
    const updated = patch.json().data;
    assert.equal(updated.salik, 250);
    assert.equal(updated.customerName, "Keep Me");
    assert.equal(updated.customerPhone, null);
  });

  test("PATCH preserves phone string and money integers round-trip", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    const rowId = create.json().data.id;
    const patch = await app.inject({
      method: "PATCH",
      url: `/archive/rows/${rowId}`,
      headers: auth(adminToken),
      payload: {
        customerPhone: "+971 050 0001111",
        visa: 570,
        cash: 1200,
      },
    });
    assert.equal(patch.statusCode, 200);
    const row = patch.json().data;
    assert.equal(row.customerPhone, "+971 050 0001111");
    assert.equal(row.visa, 570);
    assert.equal(row.cash, 1200);
  });

  test("DELETE removes only the archive row", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    const rowId = create.json().data.id;
    const vehicleBefore = await prisma.vehicle.findUnique({ where: { id: vehicleAId } });
    assert.ok(vehicleBefore);

    const del = await app.inject({
      method: "DELETE",
      url: `/archive/rows/${rowId}`,
      headers: auth(adminToken),
    });
    assert.equal(del.statusCode, 204);
    const gone = await prisma.archiveRow.findUnique({ where: { id: rowId } });
    assert.equal(gone, null);
    const vehicleAfter = await prisma.vehicle.findUnique({ where: { id: vehicleAId } });
    assert.ok(vehicleAfter);
  });

  test("invalid vehicleId returns not found", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/archive/vehicles/999999999/rows",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 404);
  });

  test("unknown archive row id returns not found", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/archive/rows/999999999",
      headers: auth(adminToken),
      payload: { customerName: "Nope" },
    });
    assert.equal(res.statusCode, 404);
  });

  test("reader cannot create rows", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(readerToken),
      payload: {},
    });
    assert.equal(res.statusCode, 403);
  });

  test("rows can be created for inactive vehicle without contract data", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${inactiveVehicleId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    assert.equal(res.statusCode, 201, res.body);
    const row = res.json().data;
    assert.equal(row.vehicleId, inactiveVehicleId);
    assert.equal(row.customerName, null);
    assert.equal(row.rentalTotal, null);
  });

  test("PATCH explicit null clears a nullable field", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(adminToken),
      payload: { customerName: "To Clear", salik: 99 },
    });
    assert.equal(create.statusCode, 201);
    const rowId = create.json().data.id;

    const patch = await app.inject({
      method: "PATCH",
      url: `/archive/rows/${rowId}`,
      headers: auth(adminToken),
      payload: { customerName: null },
    });
    assert.equal(patch.statusCode, 200, patch.body);
    assert.equal(patch.json().data.customerName, null);
    assert.equal(patch.json().data.salik, 99);
  });

  test("invalid deliveryTime is rejected", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/archive/vehicles/${vehicleAId}/rows`,
      headers: auth(adminToken),
      payload: {},
    });
    assert.equal(create.statusCode, 201);
    const rowId = create.json().data.id;

    const patch = await app.inject({
      method: "PATCH",
      url: `/archive/rows/${rowId}`,
      headers: auth(adminToken),
      payload: { deliveryTime: "25:99" },
    });
    assert.equal(patch.statusCode, 422);
  });

  test("GET /archive/export requires archive.read and returns XLSX workbook", async () => {
    const forbidden = await app.inject({
      method: "GET",
      url: "/archive/export",
    });
    assert.equal(forbidden.statusCode, 401);

    const readerDenied = await app.inject({
      method: "GET",
      url: "/archive/export",
      headers: auth(readerToken),
    });
    assert.equal(readerDenied.statusCode, 200);

    const fleetRes = await app.inject({
      method: "GET",
      url: "/archive/vehicles",
      headers: auth(adminToken),
    });
    assert.equal(fleetRes.statusCode, 200, fleetRes.body);
    const vehicles = fleetRes.json().data as Array<{
      id: number;
      displayName: string;
      plateNumber: string | null;
    }>;
    const fixtureIds = [vehicleAId, vehicleBId];
    for (const fixtureId of fixtureIds) {
      assert.ok(
        vehicles.some((vehicle) => vehicle.id === fixtureId),
        `fixture vehicle ${fixtureId} must be in active archive fleet`,
      );
    }
    assert.equal(
      vehicles.some((vehicle) => vehicle.id === inactiveVehicleId),
      false,
      "inactive fixture vehicle must not appear in archive fleet",
    );

    const res = await app.inject({
      method: "GET",
      url: "/archive/export",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.headers["content-type"] as string, /spreadsheetml/);
    assert.match(res.headers["content-disposition"] as string, /\.xlsx/);
    assert.ok((res.rawPayload as Buffer).length > 0);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0]);
    assert.equal(wb.worksheets.length, vehicles.length);
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    assert.equal(
      new Set(sheetNames).size,
      sheetNames.length,
      "export must not collapse distinct vehicles into duplicate worksheet names",
    );
    for (const vehicle of vehicles) {
      const sheet = wb.worksheets.find((ws) =>
        String(ws.getCell("A1").value ?? "").includes(vehicle.displayName),
      );
      assert.ok(sheet, `missing sheet for vehicle ${vehicle.id}`);
      assert.equal(sheet!.model.merges?.includes("A1:X1"), true);
      assert.equal(sheet!.getRow(2).cellCount, 24);
    }
  });

  test("GET rows for vehicle with no rows returns empty collection", async () => {
    const fresh = await createVehicle({
      vehicleName: `Archive Empty ${run}`,
      plateNumber: `AR ${run} E`,
    });
    const res = await app.inject({
      method: "GET",
      url: `/archive/vehicles/${fresh.id}/rows`,
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().data, []);
  });
}
