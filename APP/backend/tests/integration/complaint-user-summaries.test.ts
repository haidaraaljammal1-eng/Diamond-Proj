import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

// BE-4 close-out: assignee/actor SafeUserRef projections (no per-row user N+1,
// no PII). Verifies the additive summary embeds on list / detail / timeline.
import { bindIntegrationDatabase, INTEGRATION_ENABLED, uniqueFixtureName } from "tests/helpers/integration-harness";

const RUN = INTEGRATION_ENABLED;

if (!RUN) {
  test("complaint user-summaries integration skipped (set RUN_INTEGRATION=true + TEST_DATABASE_URL)", { skip: true }, () => {});
} else {
  bindIntegrationDatabase();
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase() + "US";
  let seq = 0;
  let adminId = 0, assigneeId = 0, branchA = 0, deptId = 0, modelId = 0;
  let adminT = "";

  async function seedUser(email: string, roleKey: string, perms: string[], name: string) {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const canonicalEmail = normalizeEmail(email);
    const role = await prisma.role.upsert({ where: { key: roleKey }, update: {}, create: { key: roleKey, name: roleKey } });
    for (const key of perms) {
      const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, category: key.split(".")[0], description: key } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, update: {}, create: { roleId: role.id, permissionId: perm.id } });
    }
    const passwordHash = await hashPassword("cmp-pass-1234567");
    const user = await prisma.user.upsert({ where: { email: canonicalEmail }, update: { status: "ACTIVE", passwordHash, name }, create: { email: canonicalEmail, name, status: "ACTIVE", passwordHash } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    return user.id;
  }
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const CP = [
    "complaints.read",
    "complaints.manage",
    "complaints.create",
    "complaints.assign",
    "complaints.resolve",
    "complaints.close",
    "complaints.view_all_branches",
    "complaints.view_all_departments",
  ];

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    adminId = await seedUser(`us-admin-${run}@ex.test`, `us_admin_${run}`, CP, "Admin Runner");
    assigneeId = await seedUser(`us-assignee-${run}@ex.test`, `us_assignee_${run}`, ["complaints.read", "complaints.manage"], "Layla Assignee");
    adminT = app.jwt.sign({ sub: adminId, type: "access" });
    modelId = (await prisma.vehicleModel.create({ data: { code: `MDL-${run}`, name: uniqueFixtureName(run, "Attrage") } })).id;
    deptId = (await prisma.department.create({ data: { code: `DEP-${run}`, name: uniqueFixtureName(run, "Delivery") } })).id;
    branchA = (await prisma.branch.create({ data: { code: `BR-${run}`, name: uniqueFixtureName(run, "Riyadh") } })).id;
    await prisma.userBranchAssignment.create({ data: { userId: assigneeId, branchId: branchA } });
    await prisma.userDepartmentAssignment.create({ data: { userId: assigneeId, departmentId: deptId } });
  });
  after(async () => { if (app) await app.close(); });

  async function makeAssignedComplaint() {
    const customer = await prisma.customer.create({ data: { name: `Buyer ${seq}`, mobile: "0501110000" } });
    const vehicle = await prisma.vehicle.create({ data: { companyId: await testCompanyId(prisma), vin: `VIN-${run}-${seq++}`, modelId, modelYear: 2024 } });
    const exp = await prisma.purchaseExperience.create({ data: { customerId: customer.id, vehicleId: vehicle.id, branchId: branchA, deliveryDate: new Date() } });
    const create = await app.inject({ method: "POST", url: "/complaints", headers: auth(adminT), payload: { customerId: customer.id, purchaseExperienceId: exp.id, departmentId: deptId, description: "N+1 removal check" } });
    assert.equal(create.statusCode, 200, create.body);
    const d = create.json().data;
    const assign = await app.inject({ method: "POST", url: `/complaints/${d.id}/assign`, headers: auth(adminT), payload: { revision: d.revision, assignedToUserId: assigneeId } });
    assert.equal(assign.statusCode, 200, assign.body);
    return d.id as number;
  }

  test("list embeds assignee SafeUserRef (id + displayName only, no PII)", async () => {
    const id = await makeAssignedComplaint();
    const res = await app.inject({ method: "GET", url: `/complaints?pageSize=50`, headers: auth(adminT) });
    assert.equal(res.statusCode, 200);
    const row = res.json().data.find((r: { id: number }) => r.id === id);
    assert.ok(row, "complaint present in list");
    assert.deepEqual(row.assignee, { id: assigneeId, displayName: "Layla Assignee" });
    assert.deepEqual(Object.keys(row.assignee).sort(), ["displayName", "id"], "no email/phone/roles leaked");
    assert.equal(row.assignedToUserId, assigneeId, "legacy id field preserved (backward compatible)");
  });

  test("detail embeds assignee SafeUserRef", async () => {
    const id = await makeAssignedComplaint();
    const res = await app.inject({ method: "GET", url: `/complaints/${id}`, headers: auth(adminT) });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().data.assignee, { id: assigneeId, displayName: "Layla Assignee" });
  });

  test("timeline embeds actor SafeUserRef; system (null) actor stays null", async () => {
    const id = await makeAssignedComplaint();
    let d = (await app.inject({ method: "GET", url: `/complaints/${id}`, headers: auth(adminT) })).json().data;
    const resolve = await app.inject({ method: "POST", url: `/complaints/${id}/resolve`, headers: auth(adminT), payload: { revision: d.revision, resolutionSummary: "done" } });
    assert.equal(resolve.statusCode, 200, resolve.body);
    d = resolve.json().data;
    const close = await app.inject({ method: "POST", url: `/complaints/${id}/close`, headers: auth(adminT), payload: { revision: d.revision } });
    assert.equal(close.statusCode, 200, close.body);
    const res = await app.inject({ method: "GET", url: `/complaints/${id}/timeline?pageSize=50`, headers: auth(adminT) });
    assert.equal(res.statusCode, 200);
    const events = res.json().data as { type: string; actorUserId: number | null; actor: { id: number; displayName: string } | null }[];
    const assigned = events.find((e) => e.type === "ASSIGNED" || e.type === "REASSIGNED");
    assert.ok(assigned, "assigned event present");
    assert.deepEqual(assigned!.actor, { id: adminId, displayName: "Admin Runner" }, "actor resolved from projection");
    const nullActor = events.find((e) => e.actorUserId === null);
    assert.ok(nullActor, "a system event with a null actor exists (e.g. POST_SURVEY_SCHEDULED)");
    assert.equal(nullActor!.actor, null, "null actor stays null (frontend renders a neutral fallback)");
  });

  test("out-of-scope complaint is 404 (existence hidden), no summary leak", async () => {
    const id = await makeAssignedComplaint();
    const zeroId = await seedUser(`us-zero-${run}@ex.test`, `us_zero_${run}`, ["complaints.read"], "Zero User");
    const zeroT = app.jwt.sign({ sub: zeroId, type: "access" });
    const res = await app.inject({ method: "GET", url: `/complaints/${id}`, headers: auth(zeroT) });
    assert.equal(res.statusCode, 404);
  });
}
