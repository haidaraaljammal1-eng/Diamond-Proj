import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * End-to-end operational-domain tests (customers / vehicles / experiences / 360 /
 * record-in-use). Build the real app + hit the DB; only run when
 * RUN_INTEGRATION=true with a disposable test DATABASE_URL. All external keys are
 * run-suffixed to stay re-runnable.
 */
import { bindIntegrationDatabase, INTEGRATION_ENABLED, uniqueFixtureName } from "tests/helpers/integration-harness";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

if (!INTEGRATION_ENABLED) {
  test("operational integration skipped (set RUN_INTEGRATION=true + TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  bindIntegrationDatabase();
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = { email: `op-admin-${run}@example.test`, password: "op-admin-pass-123" };
  const reader = { email: `op-reader-${run}@example.test`, password: "op-reader-pass-123" };
  let adminToken = "";
  let readerToken = "";

  let modelId = 0;
  let branchAId = 0;
  let branchBId = 0;

  const ADMIN_PERMS = [
    "customers.read",
    // Customers are branch-scoped through their purchase experiences; this suite's
    // admin is a cross-branch operator and its fixtures include customers with no
    // experience at all, which belong to no branch.
    "customers.view_all_branches",
    "customers.manage",
    "vehicles.read",
    "vehicles.manage",
    "purchase_experiences.read",
    "purchase_experiences.manage",
    "branches.read",
    "branches.manage",
    "vehicle_models.read",
    "vehicle_models.manage",
  ];

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
    const user = await prisma.user.upsert({
      where: { email: canonicalEmail },
      update: { status: "ACTIVE", passwordHash },
      create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
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
  const post = (url: string, token: string, payload?: object) =>
    app.inject({ method: "POST", url, headers: auth(token), payload });

  async function createVehicle(vin: string) {
    const res = await post("/vehicles", adminToken, {
      companyId: await testCompanyId(prisma),
      vin,
      modelId,
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data.id as number;
  }
  async function createCustomer(name: string, extra: Record<string, unknown> = {}) {
    const res = await post("/customers", adminToken, { name, ...extra });
    assert.equal(res.statusCode, 201);
    return res.json().data.id as number;
  }
  async function createExperience(payload: Record<string, unknown>) {
    return post("/purchase-experiences", adminToken, payload);
  }

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(admin.email, admin.password, `op_admin_${run}`, ADMIN_PERMS);
    await seedUser(reader.email, reader.password, `op_reader_${run}`, ["customers.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);

    const model = await prisma.vehicleModel.create({
      data: { code: `MDL-${run}`, name: uniqueFixtureName(run, "Attrage") },
    });
    modelId = model.id;
    const branchA = await prisma.branch.create({ data: { code: `BRA-${run}`, name: uniqueFixtureName(run, "Branch A") } });
    const branchB = await prisma.branch.create({ data: { code: `BRB-${run}`, name: uniqueFixtureName(run, "Branch B") } });
    branchAId = branchA.id;
    branchBId = branchB.id;
  });

  after(async () => {
    if (app) await app.close();
  });

  test("customer create + update; contact change is audited by field name only", async () => {
    const id = await createCustomer("Ahmed", { mobile: "+966 50 111 2222" });
    const upd = await app.inject({
      method: "PUT",
      url: `/customers/${id}`,
      headers: auth(adminToken),
      payload: { email: "AHMED@Example.com", optOutWhatsApp: true },
    });
    assert.equal(upd.statusCode, 200);
    assert.equal(upd.json().data.email, "ahmed@example.com"); // normalized
    assert.equal(upd.json().data.optOutWhatsApp, true);

    const rows = await prisma.auditLog.findMany({
      where: { action: "customers.update", entityId: String(id) },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const row = rows.find((entry) => {
      const meta = entry.metadata as { contactFieldsChanged?: string[] } | null;
      return (
        meta?.contactFieldsChanged?.includes("email") &&
        meta?.contactFieldsChanged?.includes("optOutWhatsApp")
      );
    });
    assert.ok(row, "expected an audit row for customers.update with contact field metadata");
    const meta = row?.metadata as { contactFieldsChanged?: string[] } | null;
    assert.ok(meta?.contactFieldsChanged?.includes("email"));
    assert.ok(meta?.contactFieldsChanged?.includes("optOutWhatsApp"));
    // The audit must not carry the raw contact value.
    assert.ok(!JSON.stringify(row?.metadata).includes("ahmed@example.com"));
  });

  test("inline vehicle block is refused (fleet vehicle must exist first)", async () => {
    const customerId = await createCustomer("Inline Buyer");
    const res = await createExperience({
      customerId,
      vehicle: { modelId, modelYear: 2024, vin: `VIN-${run}-INLINE` },
      branchId: branchAId,
      purchaseDate: "2026-01-15",
    });
    assert.equal(res.statusCode, 422);
    const details = res.json().error.details;
    const field = Array.isArray(details)
      ? details[0]?.path?.replace(/^\//, "")
      : details?.fields?.[0] ?? res.json().error.context?.fields?.[0];
    assert.equal(field, "vehicle");
    const vehicleId = await createVehicle(`VIN-${run}-INLINE`);
    const linked = await createExperience({
      customerId,
      vehicleId,
      branchId: branchAId,
      purchaseDate: "2026-01-15",
    });
    assert.equal(linked.statusCode, 201);
    assert.equal(linked.json().data.vehicleId, vehicleId);
  });

  test("duplicate VIN on fleet create is rejected (409) with NO partial experience row", async () => {
    const customerId = await createCustomer("Dup VIN Buyer");
    const vin = `VIN-${run}-DUP`;
    const vehicleId = await createVehicle(vin);
    const before = await prisma.purchaseExperience.count({ where: { customerId } });
    const dup = await post("/vehicles", adminToken, {
      companyId: await testCompanyId(prisma),
      vin: vin.toLowerCase(),
      modelId,
    });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.json().error.conflicts[0].field, "vin");
    const exp = await createExperience({ customerId, vehicleId, branchId: branchAId });
    assert.equal(exp.statusCode, 201);
    const after = await prisma.purchaseExperience.count({ where: { customerId } });
    assert.equal(after, before + 1);
  });

  test("exactly one vehicle source: both / neither are rejected", async () => {
    const customerId = await createCustomer("XOR Buyer");
    const v = await createVehicle(`VIN-${run}-XOR`);
    const both = await createExperience({
      customerId,
      vehicleId: v,
      vehicle: { modelId },
      branchId: branchAId,
    });
    assert.equal(both.statusCode, 422);
    const neither = await createExperience({ customerId, branchId: branchAId });
    assert.equal(neither.statusCode, 422);
  });

  test("a customer supports MULTIPLE purchase experiences", async () => {
    const customerId = await createCustomer("Multi Buyer");
    const v1 = await createVehicle(`VIN-${run}-A`);
    const v2 = await createVehicle(`VIN-${run}-B`);
    const e1 = await createExperience({ customerId, vehicleId: v1, branchId: branchAId });
    const e2 = await createExperience({ customerId, vehicleId: v2, branchId: branchBId });
    assert.equal(e1.statusCode, 201);
    assert.equal(e2.statusCode, 201);

    const list = await app.inject({
      method: "GET",
      url: `/purchase-experiences?customerId=${customerId}`,
      headers: auth(adminToken),
    });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().data.length, 2);

    const threeSixty = await app.inject({
      method: "GET",
      url: `/customers/${customerId}/360`,
      headers: auth(adminToken),
    });
    assert.equal(threeSixty.statusCode, 200);
    const body = threeSixty.json().data;
    assert.equal(body.customer.id, customerId);
    assert.equal(body.experiences.length, 2);
    assert.ok(body.experiences[0].vehicle.model.name); // aggregated model
    assert.ok(body.experiences[0].branch.name); // aggregated branch
    assert.equal("modules" in body, false);
    assert.ok("complaints" in body);
    assert.ok("callCenter" in body);
    assert.equal(typeof body.complaints.openComplaintsCount, "number");
  });

  test("duplicate VIN (normalized) is rejected (409 CONFLICT, field vin)", async () => {
    await createVehicle(`DUP-${run}`);
    const dup = await post("/vehicles", adminToken, {
      companyId: await testCompanyId(prisma),
      vin: `dup-${run}`.toLowerCase(),
      modelId,
    });
    assert.equal(dup.statusCode, 409);
    const err = dup.json().error;
    assert.equal(err.code, "CONFLICT");
    assert.equal(err.conflicts[0].field, "vin");
  });

  test("experience with an unknown branch is rejected (422 invalid_parent)", async () => {
    const customerId = await createCustomer("Bad Branch");
    const vehicleId = await createVehicle(`VIN-${run}-BAD`);
    const res = await createExperience({
      customerId,
      vehicleId,
      branchId: 999999999,
    });
    assert.equal(res.statusCode, 422);
    const err = res.json().error;
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.equal(err.context.reason, "invalid_parent");
    assert.equal(err.context.field, "branchId");
  });

  test("selecting INACTIVE master data for a new vehicle is rejected (422 inactive_reference)", async () => {
    const deadModel = await prisma.vehicleModel.create({
      data: { code: `DEAD-${run}`, name: uniqueFixtureName(run, "Retired"), isActive: false },
    });
    const res = await post("/vehicles", adminToken, {
      companyId: await testCompanyId(prisma),
      vin: `VIN-${run}-DEAD`,
      modelId: deadModel.id,
    });
    assert.equal(res.statusCode, 422);
    const err = res.json().error;
    assert.equal(err.context.reason, "inactive_reference");
    assert.equal(err.context.field, "modelId");
  });

  test("experience list filters by branch (authoritative relation) + paginated envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/purchase-experiences?branchId=${branchBId}&page=1&pageSize=10`,
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.deepEqual(
      Object.keys(json.meta).sort(),
      ["page", "pageSize", "total", "totalPages"],
    );
    for (const row of json.data) assert.equal(row.branchId, branchBId);
  });

  test("customer/vehicle are immutable on experience update; dates are editable", async () => {
    const customerId = await createCustomer("Immutable");
    const vehicleId = await createVehicle(`VIN-${run}-IMM`);
    const created = await createExperience({ customerId, vehicleId, branchId: branchAId });
    const expId = created.json().data.id;

    const changed = await app.inject({
      method: "PUT",
      url: `/purchase-experiences/${expId}`,
      headers: auth(adminToken),
      payload: { customerId: customerId + 100000 },
    });
    assert.equal(changed.statusCode, 422);
    assert.equal(changed.json().error.context.reason, "immutable_field");

    const ok = await app.inject({
      method: "PUT",
      url: `/purchase-experiences/${expId}`,
      headers: auth(adminToken),
      payload: { deliveryDate: "2026-07-01T00:00:00.000Z", customerId },
    });
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.json().data.deliveryDate);
  });

  test("vehicle VIN is immutable after creation; omitted/same-normalized is a no-op", async () => {
    const vehicleId = await createVehicle(`IMMVIN-${run}`); // stored canonical (upper)

    // Changing the VIN is rejected with the structured immutable_field error.
    const changed = await app.inject({
      method: "PUT",
      url: `/vehicles/${vehicleId}`,
      headers: auth(adminToken),
      payload: { vin: `OTHER-${run}` },
    });
    assert.equal(changed.statusCode, 422);
    assert.equal(changed.json().error.code, "VALIDATION_ERROR");
    assert.equal(changed.json().error.context.reason, "immutable_field");
    assert.equal(changed.json().error.context.field, "vin");

    // Same VIN in a different case normalizes equal → accepted as a no-op, and a
    // co-submitted editable field still applies.
    const sameVin = await app.inject({
      method: "PUT",
      url: `/vehicles/${vehicleId}`,
      headers: auth(adminToken),
      payload: { vin: `immvin-${run}`.toLowerCase(), modelYear: 2024 },
    });
    assert.equal(sameVin.statusCode, 200);
    assert.equal(sameVin.json().data.vin, `IMMVIN-${run}`);
    assert.equal(sameVin.json().data.modelYear, 2024);

    // Omitting the VIN entirely still allows editing other fields.
    const omitted = await app.inject({
      method: "PUT",
      url: `/vehicles/${vehicleId}`,
      headers: auth(adminToken),
      payload: { modelYear: 2025 },
    });
    assert.equal(omitted.statusCode, 200);
    assert.equal(omitted.json().data.vin, `IMMVIN-${run}`);
    assert.equal(omitted.json().data.modelYear, 2025);
  });

  test("experience list/detail are enriched with nested display refs (no extra fetch)", async () => {
    const customerId = await createCustomer("Nested Display");
    const vehicleId = await createVehicle(`VIN-${run}-NEST`);
    const salesperson = await prisma.salesperson.create({
      data: { code: `SP-${run}`, name: "Sales Rep" },
    });

    const withRep = await createExperience({
      customerId,
      vehicleId,
      branchId: branchAId,
      salespersonId: salesperson.id,
    });
    assert.equal(withRep.statusCode, 201);
    const expId = withRep.json().data.id as number;

    // Detail: scalar FKs are preserved AND nested display refs are present.
    const detail = await app.inject({
      method: "GET",
      url: `/purchase-experiences/${expId}`,
      headers: auth(adminToken),
    });
    assert.equal(detail.statusCode, 200);
    const row = detail.json().data;
    // Backward-compatible scalar ids remain.
    assert.equal(row.customerId, customerId);
    assert.equal(row.vehicleId, vehicleId);
    assert.equal(row.branchId, branchAId);
    // Lightweight nested refs.
    assert.equal(row.customer.id, customerId);
    assert.equal(row.customer.name, "Nested Display");
    assert.equal(row.vehicle.id, vehicleId);
    assert.equal(row.vehicle.vin, `VIN-${run}-NEST`);
    assert.ok(row.vehicle.model.name); // Attrage
    assert.equal(row.branch.id, branchAId);
    assert.ok(row.branch.code);
    assert.equal(row.salesperson.id, salesperson.id);
    assert.equal(row.salesperson.name, "Sales Rep");

    // List rows carry the same enriched shape.
    const list = await app.inject({
      method: "GET",
      url: `/purchase-experiences?customerId=${customerId}`,
      headers: auth(adminToken),
    });
    assert.equal(list.statusCode, 200);
    const listed = list.json().data.find((r: { id: number }) => r.id === expId);
    assert.ok(listed);
    assert.equal(listed.customer.name, "Nested Display");
    assert.ok(listed.vehicle.model.name);
    assert.equal(listed.salesperson.name, "Sales Rep");

    // Optional salesperson is null (not omitted) when absent.
    const noRep = await createExperience({ customerId, vehicleId, branchId: branchAId });
    assert.equal(noRep.statusCode, 201);
    const noRepDetail = await app.inject({
      method: "GET",
      url: `/purchase-experiences/${noRep.json().data.id}`,
      headers: auth(adminToken),
    });
    assert.equal(noRepDetail.statusCode, 200);
    assert.equal(noRepDetail.json().data.salesperson, null);
  });

  test("vehicle color + experience CX labels round-trip and surface in 360", async () => {
    const customerId = await createCustomer("CX Buyer");

    // Color is a first-class vehicle field on create...
    const vRes = await post("/vehicles", adminToken, {
      companyId: await testCompanyId(prisma),
      vin: `VIN-${run}-CLR`,
      modelId,
      color: "Pearl White",
    });
    assert.equal(vRes.statusCode, 201);
    assert.equal(vRes.json().data.color, "Pearl White");
    const vehicleId = vRes.json().data.id as number;

    // ...and editable on update (independent of VIN immutability).
    const vUpd = await app.inject({
      method: "PUT",
      url: `/vehicles/${vehicleId}`,
      headers: auth(adminToken),
      payload: { modelId, color: "Midnight Black" },
    });
    assert.equal(vUpd.statusCode, 200);
    assert.equal(vUpd.json().data.color, "Midnight Black");

    // CX labels live on the purchase experience.
    const eRes = await createExperience({
      customerId,
      vehicleId,
      branchId: branchAId,
      financingType: "Bank finance",
      insuranceType: "Comprehensive",
      salesChannel: "Showroom",
    });
    assert.equal(eRes.statusCode, 201);
    assert.equal(eRes.json().data.financingType, "Bank finance");
    assert.equal(eRes.json().data.insuranceType, "Comprehensive");
    assert.equal(eRes.json().data.salesChannel, "Showroom");

    // 360 projection carries them (no extra fetch).
    const body = (
      await app.inject({
        method: "GET",
        url: `/customers/${customerId}/360`,
        headers: auth(adminToken),
      })
    ).json().data;
    const exp = body.experiences.find(
      (e: { id: number }) => e.id === eRes.json().data.id,
    );
    assert.ok(exp);
    assert.equal(exp.vehicle.color, "Midnight Black");
    assert.equal(exp.financingType, "Bank finance");
    assert.equal(exp.insuranceType, "Comprehensive");
    assert.equal(exp.salesChannel, "Showroom");
  });

  test("360 latestExperienceId = newest by (deliveryDate ?? purchaseDate ?? createdAt)", async () => {
    const customerId = await createCustomer("Recency");
    const vA = await createVehicle(`VIN-${run}-R1`);
    const vB = await createVehicle(`VIN-${run}-R2`);

    // eB's delivery (2030) beats eA's purchase (2028) → eB is latest, regardless
    // of insertion order (eA inserted last).
    const eB = await createExperience({
      customerId,
      vehicleId: vB,
      branchId: branchBId,
      deliveryDate: "2030-01-01T00:00:00.000Z",
    });
    const eA = await createExperience({
      customerId,
      vehicleId: vA,
      branchId: branchAId,
      purchaseDate: "2028-01-01T00:00:00.000Z",
    });
    assert.equal(eA.statusCode, 201);
    assert.equal(eB.statusCode, 201);

    const body = (
      await app.inject({
        method: "GET",
        url: `/customers/${customerId}/360`,
        headers: auth(adminToken),
      })
    ).json().data;
    // Full history preserved (both experiences present).
    assert.equal(body.experiences.length, 2);
    assert.equal(body.latestExperienceId, eB.json().data.id);
  });

  test("360 salesperson projection is safe (id/code/name only — no PII)", async () => {
    const customerId = await createCustomer("Safe Ref");
    const vehicleId = await createVehicle(`VIN-${run}-SAFE`);
    const salesperson = await prisma.salesperson.create({
      data: { code: `SP-SAFE-${run}`, name: "Rep Safe" },
    });
    await createExperience({
      customerId,
      vehicleId,
      branchId: branchAId,
      salespersonId: salesperson.id,
    });
    const body = (
      await app.inject({
        method: "GET",
        url: `/customers/${customerId}/360`,
        headers: auth(adminToken),
      })
    ).json().data;
    const sp = body.experiences[0].salesperson;
    assert.deepEqual(Object.keys(sp).sort(), ["code", "id", "name"]);
    assert.equal("email" in sp, false);
    assert.equal("phone" in sp, false);
  });

  test("deactivating in-use master data PROCEEDS, preserves history, hides from lookups", async () => {
    const customerId = await createCustomer("History Keeper");
    const vehicleId = await createVehicle(`VIN-${run}-HIST`);
    const exp = await createExperience({ customerId, vehicleId, branchId: branchAId });
    const expId = exp.json().data.id;

    // Deactivate a branch that is referenced by an existing experience — allowed.
    const off = await post(`/branches/${branchAId}/deactivate`, adminToken, undefined);
    assert.equal(off.statusCode, 200);
    assert.equal(off.json().data.isActive, false);

    // Historical experience still valid and still references the branch.
    const still = await app.inject({
      method: "GET",
      url: `/purchase-experiences/${expId}`,
      headers: auth(adminToken),
    });
    assert.equal(still.statusCode, 200);
    assert.equal(still.json().data.branchId, branchAId);

    // But the deactivated branch no longer appears in the lookup (no future selection).
    const lookup = await app.inject({
      method: "GET",
      url: `/lookups/branches?search=BRA-${run}`,
      headers: auth(adminToken),
    });
    assert.equal(lookup.statusCode, 200);
    assert.equal(
      lookup.json().data.find((b: { id: number }) => b.id === branchAId),
      undefined,
    );

    // Reactivate to leave state clean.
    const on = await post(`/branches/${branchAId}/reactivate`, adminToken, undefined);
    assert.equal(on.statusCode, 200);
  });

  test("RBAC: reader (customers.read) cannot create; unauthenticated is rejected", async () => {
    const forbidden = await post("/customers", readerToken, { name: "Blocked" });
    assert.equal(forbidden.statusCode, 403);

    const unauth = await app.inject({ method: "GET", url: "/customers" });
    assert.ok(unauth.statusCode === 401 || unauth.statusCode === 403);
  });
}
