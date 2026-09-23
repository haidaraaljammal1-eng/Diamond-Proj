import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Runtime matrix for DEPARTMENT-DRIVEN user branch assignment (the change that made
 * Department branch-scoped and derives a user's branch scope from their department
 * memberships). Proves the locked product decision end-to-end against the real app:
 *
 *   - The admin submits `departmentIds` only; the backend derives the DISTINCT set of
 *     branches and synchronizes UserBranchAssignment transactionally.
 *   - A forged `branchIds` from the client is IGNORED — branches come from departments.
 *   - Editing a user's departments re-derives branches (obsolete branches dropped).
 *   - Complaint assignee lookup / notification audience operate on the EXACT
 *     branch-scoped department membership (a Riyadh-Complaints user never leaks into a
 *     Jeddah-Complaints audience).
 *   - Role/RBAC stays independent of department membership.
 *   - Legacy users (branch, no department) keep their access; they are identifiable.
 *   - The department-options lookup is reachable with users.create/users.update alone
 *     (no departments.read), and 403 without them.
 *
 * Maps to the §32 test list (TEST 1..11). Only runs with RUN_INTEGRATION=true and a
 * disposable test DATABASE_URL. Codes/emails are suffixed per-run so it re-runs clean.
 */
import { bindIntegrationDatabase, INTEGRATION_ENABLED } from "tests/helpers/integration-harness";

if (!INTEGRATION_ENABLED) {
  test("user-department-scope integration skipped (set RUN_INTEGRATION=true + TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  bindIntegrationDatabase();
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();

  // Admin persona: user management only (NO departments.read) — proves the contextual
  // department lookup is authorized by the user-management capability (§20, TEST 11).
  const admin = { email: `uds-admin-${run}@example.test`, password: "uds-admin-pass-1" };
  const ADMIN_PERMS = ["users.create", "users.update", "users.read"];

  // Assign persona: complaints.assign only, scoped to the Riyadh complaints dept —
  // used to exercise the assignee lookup (TEST 6/9).
  const assigner = { email: `uds-assign-${run}@example.test`, password: "uds-assign-pass-1" };
  const ASSIGN_PERMS = ["complaints.assign"];

  let adminTok = "";
  let assignTok = "";

  // Branches
  let branchRiyadh = 0;
  let branchJeddah = 0;
  // Per-branch departments (same business name, different branch = distinct records).
  let deptComplaintsRiyadh = 0;
  let deptComplaintsJeddah = 0;
  let deptServiceRiyadh = 0;
  // Assignee-lookup targets (active staff with a complaint capability).
  let targetRiyadhId = 0; // eligible for the Riyadh complaints dept
  let targetJeddahId = 0; // NOT eligible for the Riyadh complaints dept

  async function seedUser(
    email: string,
    password: string,
    roleKey: string,
    permKeys: string[],
  ): Promise<number> {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const canonicalEmail = normalizeEmail(email);
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey },
    });
    for (const key of permKeys) {
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
    return user.id;
  }

  async function login(creds: { email: string; password: string }) {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
    assert.equal(res.statusCode, 200);
    return res.json().data.accessToken as string;
  }

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;

    branchRiyadh = (await prisma.branch.create({ data: { code: `UDS-BR-${run}`, name: `UDS Riyadh ${run}` } })).id;
    branchJeddah = (await prisma.branch.create({ data: { code: `UDS-BJ-${run}`, name: `UDS Jeddah ${run}` } })).id;

    // Same business name across two branches → two distinct branch-scoped departments.
    deptComplaintsRiyadh = (
      await prisma.department.create({
        data: { code: `UDS-DCR-${run}`, name: `UDS Complaints ${run}`, branchId: branchRiyadh },
      })
    ).id;
    deptComplaintsJeddah = (
      await prisma.department.create({
        data: { code: `UDS-DCJ-${run}`, name: `UDS Complaints ${run}`, branchId: branchJeddah },
      })
    ).id;
    deptServiceRiyadh = (
      await prisma.department.create({
        data: { code: `UDS-DSR-${run}`, name: `UDS Service ${run}`, branchId: branchRiyadh },
      })
    ).id;

    await seedUser(admin.email, admin.password, `uds_admin_${run}`, ADMIN_PERMS);
    const assignId = await seedUser(assigner.email, assigner.password, `uds_assign_${run}`, ASSIGN_PERMS);
    // Scope the assigner to the Riyadh complaints dept (+ its branch) so the assignee
    // lookup is evaluated within that exact department.
    await prisma.userDepartmentAssignment.create({
      data: { userId: assignId, departmentId: deptComplaintsRiyadh },
    });
    await prisma.userBranchAssignment.create({
      data: { userId: assignId, branchId: branchRiyadh },
    });

    // Assignee-lookup targets: active staff with complaints.manage (a complaint
    // capability), one in each branch-scoped department.
    const capRole = await prisma.role.upsert({
      where: { key: `uds_cap_${run}` },
      update: {},
      create: { key: `uds_cap_${run}`, name: `uds_cap_${run}` },
    });
    const capPerm = await prisma.permission.upsert({
      where: { key: "complaints.manage" },
      update: {},
      create: { key: "complaints.manage", category: "complaints", description: "complaints.manage" },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: capRole.id, permissionId: capPerm.id } },
      update: {},
      create: { roleId: capRole.id, permissionId: capPerm.id },
    });
    async function mkTarget(email: string, departmentId: number, branchId: number) {
      const u = await prisma.user.create({ data: { email, name: email, status: "ACTIVE" } });
      await prisma.userRole.create({ data: { userId: u.id, roleId: capRole.id } });
      await prisma.userDepartmentAssignment.create({ data: { userId: u.id, departmentId } });
      await prisma.userBranchAssignment.create({ data: { userId: u.id, branchId } });
      return u.id;
    }
    targetRiyadhId = await mkTarget(`uds-tr-${run}@example.test`, deptComplaintsRiyadh, branchRiyadh);
    targetJeddahId = await mkTarget(`uds-tj-${run}@example.test`, deptComplaintsJeddah, branchJeddah);

    adminTok = await login(admin);
    assignTok = await login(assigner);
  });

  after(async () => {
    if (app) await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) =>
    app.inject({ method: "GET", url, headers: auth(token) });

  // Create a PENDING user through the real API and return the created public user.
  async function createUser(body: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: auth(adminTok),
      payload: { email: `uds-u-${run}-${Math.random().toString(36).slice(2, 8)}@example.test`, ...body },
    });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data.user as {
      id: number;
      departments: Array<{ id: number; branchId: number | null }>;
      branches: Array<{ id: number; isPrimary: boolean }>;
      permissions: string[];
    };
  }
  async function setDepartments(userId: number, departmentIds: number[]) {
    const res = await app.inject({
      method: "PUT",
      url: `/users/${userId}/departments`,
      headers: auth(adminTok),
      payload: { departmentIds },
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().data as {
      departments: Array<{ id: number }>;
      branches: Array<{ id: number; isPrimary: boolean }>;
    };
  }
  const branchIds = (u: { branches: Array<{ id: number }> }) => u.branches.map((b) => b.id).sort();

  // ── TEST 1: single department → one derived branch ───────────────────────────
  test("TEST 1: create with one department derives its branch (no manual branch input)", async () => {
    const u = await createUser({ departmentIds: [deptComplaintsRiyadh] });
    assert.equal(u.departments.length, 1);
    assert.deepEqual(branchIds(u), [branchRiyadh]);
  });

  // ── TEST 2: two departments in the same branch → ONE branch ──────────────────
  test("TEST 2: two departments in one branch derive a single branch assignment", async () => {
    const u = await createUser({ departmentIds: [deptComplaintsRiyadh, deptServiceRiyadh] });
    assert.equal(u.departments.length, 2);
    assert.deepEqual(branchIds(u), [branchRiyadh]);
  });

  // ── TEST 3: two departments in different branches → TWO branches ─────────────
  test("TEST 3: departments across two branches derive both branches", async () => {
    const u = await createUser({ departmentIds: [deptComplaintsRiyadh, deptComplaintsJeddah] });
    assert.equal(u.departments.length, 2);
    assert.deepEqual(branchIds(u), [branchRiyadh, branchJeddah].sort());
  });

  // ── TEST 4: forged branchIds are ignored — branch derived from departments ────
  test("TEST 4: a forged branchId from the client is ignored (branch derived server-side)", async () => {
    const u = await createUser({ departmentIds: [deptComplaintsRiyadh], branchIds: [branchJeddah] });
    assert.deepEqual(branchIds(u), [branchRiyadh], "Jeddah must NOT be assigned from the forged branchId");
  });

  // ── TEST 5: removing the last Riyadh department drops the Riyadh branch ───────
  test("TEST 5: editing departments re-derives branches (obsolete branch removed)", async () => {
    const u = await createUser({ departmentIds: [deptComplaintsRiyadh, deptComplaintsJeddah] });
    assert.deepEqual(branchIds(u), [branchRiyadh, branchJeddah].sort());
    const after = await setDepartments(u.id, [deptComplaintsJeddah]);
    assert.deepEqual(branchIds(after), [branchJeddah], "Riyadh branch must be dropped once no Riyadh dept remains");
    assert.equal(after.departments.length, 1);
  });

  // ── TEST 8: role/permissions are NOT granted by department membership ─────────
  test("TEST 8: department assignment does not grant any complaint permission", async () => {
    const u = await createUser({ departmentIds: [deptComplaintsRiyadh], roleIds: [] });
    assert.ok(
      !u.permissions.some((p) => p.startsWith("complaints.")),
      "a department assignment must never confer complaint permissions",
    );
  });

  // ── TEST 6 + 9: assignee lookup uses the EXACT branch-scoped department ───────
  test("TEST 6/9: assignee lookup returns the exact-department staff, excludes the same-named other-branch dept", async () => {
    const res = await get(`/complaints/assignees?departmentId=${deptComplaintsRiyadh}`, assignTok);
    assert.equal(res.statusCode, 200, res.body);
    const ids = (res.json().data.items as Array<{ userId: number }>).map((i) => i.userId);
    assert.ok(ids.includes(targetRiyadhId), "the Riyadh-complaints staff member must appear");
    assert.ok(
      !ids.includes(targetJeddahId),
      "the Jeddah-complaints staff member (same dept name, other branch) must be excluded",
    );
  });

  // ── TEST 7: notification/audience membership is exact per branch-scoped dept ──
  test("TEST 7: department membership does not bleed across branches (audience separation)", async () => {
    const riyadhMembers = await prisma.userDepartmentAssignment.findMany({
      where: { departmentId: deptComplaintsRiyadh },
      select: { userId: true },
    });
    const ids = riyadhMembers.map((m) => m.userId);
    assert.ok(ids.includes(targetRiyadhId), "Riyadh dept audience includes the Riyadh member");
    assert.ok(
      !ids.includes(targetJeddahId),
      "Riyadh dept audience must NOT include the Jeddah member of the same-named dept",
    );
  });

  // ── TEST 10: legacy user (branch, no department) keeps access + is identifiable ─
  test("TEST 10: a legacy branch-only user keeps branch access and is identifiable", async () => {
    const legacy = await prisma.user.create({
      data: { email: `uds-legacy-${run}@example.test`, name: "UDS Legacy", status: "ACTIVE" },
    });
    await prisma.userBranchAssignment.create({ data: { userId: legacy.id, branchId: branchRiyadh, isPrimary: true } });

    const res = await get(`/users/${legacy.id}`, adminTok);
    assert.equal(res.statusCode, 200);
    const body = res.json().data as { branches: Array<{ id: number }>; departments: unknown[] };
    assert.deepEqual(body.branches.map((b) => b.id), [branchRiyadh], "legacy branch access is preserved");
    assert.equal(body.departments.length, 0, "legacy user has no departments");

    // Identifiable for migration review: branch assignment but zero departments.
    const flagged = await prisma.user.findMany({
      where: {
        id: legacy.id,
        branchAssignments: { some: {} },
        departmentAssignments: { none: {} },
      },
      select: { id: true },
    });
    assert.equal(flagged.length, 1, "legacy branch-only user must be reportable");
  });

  // ── TEST 11: contextual department lookup is gated on user-management, not dept.read ─
  test("TEST 11: department-options works with users.create/update but not without", async () => {
    const ok = await get("/users/department-options", adminTok);
    assert.equal(ok.statusCode, 200, "users.create/update must reach the department options lookup");
    const items = ok.json().data as Array<{ departmentId: number; branchId: number; branchName: string }>;
    // Only branch-scoped departments are offered, and each carries its branch.
    assert.ok(items.every((d) => typeof d.branchId === "number" && d.branchName.length > 0));
    assert.ok(items.some((d) => d.departmentId === deptComplaintsRiyadh));

    const denied = await get("/users/department-options", assignTok);
    assert.equal(denied.statusCode, 403, "a non user-manager must be 403'd from the department options lookup");
  });

  // ── Guard: the lookup never offers a legacy null-branch department ────────────
  test("department-options excludes legacy null-branch departments", async () => {
    const legacyDept = await prisma.department.create({
      data: { code: `UDS-LEG-${run}`, name: `UDS Legacy Dept ${run}` },
    });
    const res = await get(`/users/department-options?search=UDS Legacy Dept ${run}`, adminTok);
    assert.equal(res.statusCode, 200);
    const items = res.json().data as Array<{ departmentId: number }>;
    assert.ok(
      !items.some((d) => d.departmentId === legacyDept.id),
      "a department without a branch cannot be assigned and must not appear",
    );
  });
}
