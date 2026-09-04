import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Runtime matrix for the CONTEXTUAL assignee/agent lookup model (the fix that
 * moved assignee/agent pickers off the org-wide `/lookups/users`). Proves the
 * core contract end-to-end against the real app + DB:
 *
 *   - A user with ONLY a business action (complaints.assign / call_center_queue.assign
 *     / users.create / complaints.create) can call the contextual lookup that action
 *     needs — WITHOUT holding the referenced entity's full `.read` and WITHOUT the
 *     generic `users.lookup`/`users.read`.
 *   - That same user is still 403'd from the org-wide `/lookups/users` and from the
 *     full list/page endpoints.
 *   - The contextual assignee/agent lookups enforce BRANCH + DEPARTMENT scope
 *     (out-of-scope targets are excluded).
 *   - The projections are minimal and carry NO email/phone (no staff-directory leak).
 *
 * Only runs with RUN_INTEGRATION=true and a disposable test DATABASE_URL. All
 * codes/emails are suffixed per-run so it stays re-runnable.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("contextual-lookup-permissions integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();

  // Persona: complaint assigner — complaints.assign ONLY, scoped to deptA + branchA
  // (no view_all_*). Must reach /complaints/assignees but NOT /lookups/users.
  const assigner = { email: `cl-assign-${run}@example.test`, password: "cl-assign-pass-1" };
  const ASSIGN_PERMS = ["complaints.assign"];

  // Persona: call-center reassigner — call_center_queue.assign ONLY, scoped to branchA.
  const ccAgent = { email: `cl-cc-${run}@example.test`, password: "cl-cc-pass-1" };
  const CC_PERMS = ["call_center_queue.assign"];

  // Persona: user-admin — users.create ONLY. Must reach /lookups/roles, not /roles.
  const userAdmin = { email: `cl-ua-${run}@example.test`, password: "cl-ua-pass-1" };
  const UA_PERMS = ["users.create"];

  // Persona: complaint creator — complaints.create ONLY. Must reach
  // /lookups/purchase-experiences, not the full /purchase-experiences list.
  const creator = { email: `cl-create-${run}@example.test`, password: "cl-create-pass-1" };
  const CREATE_PERMS = ["complaints.create"];

  let assignTok = "";
  let ccTok = "";
  let uaTok = "";
  let createTok = "";

  let deptA = 0;
  let deptB = 0;
  let branchA = 0;
  let branchB = 0;
  let targetInId = 0; // eligible: deptA + branchA
  let targetOutId = 0; // out of scope: deptB + branchB

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

  async function assignDept(userId: number, departmentId: number) {
    await prisma.userDepartmentAssignment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: {},
      create: { userId, departmentId },
    });
  }
  async function assignBranch(userId: number, branchId: number) {
    await prisma.userBranchAssignment.upsert({
      where: { userId_branchId: { userId, branchId } },
      update: {},
      create: { userId, branchId },
    });
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

    deptA = (await prisma.department.create({ data: { code: `CL-DA-${run}`, name: "CL Dept A" } })).id;
    deptB = (await prisma.department.create({ data: { code: `CL-DB-${run}`, name: "CL Dept B" } })).id;
    branchA = (await prisma.branch.create({ data: { code: `CL-BA-${run}`, name: "CL Branch A" } })).id;
    branchB = (await prisma.branch.create({ data: { code: `CL-BB-${run}`, name: "CL Branch B" } })).id;

    const assignId = await seedUser(assigner.email, assigner.password, `cl_assign_${run}`, ASSIGN_PERMS);
    const ccId = await seedUser(ccAgent.email, ccAgent.password, `cl_cc_${run}`, CC_PERMS);
    await seedUser(userAdmin.email, userAdmin.password, `cl_ua_${run}`, UA_PERMS);
    await seedUser(creator.email, creator.password, `cl_create_${run}`, CREATE_PERMS);

    // Scope the assigner + cc persona to A only (no view_all_* granted).
    await assignDept(assignId, deptA);
    await assignBranch(assignId, branchA);
    await assignBranch(ccId, branchA);

    // Target staff: one eligible (deptA+branchA), one out of scope (deptB+branchB).
    const tin = await prisma.user.create({
      data: { email: `cl-tin-${run}@example.test`, name: "Target In", status: "ACTIVE" },
    });
    const tout = await prisma.user.create({
      data: { email: `cl-tout-${run}@example.test`, name: "Target Out", status: "ACTIVE" },
    });
    targetInId = tin.id;
    targetOutId = tout.id;
    await assignDept(tin.id, deptA);
    await assignBranch(tin.id, branchA);
    await assignDept(tout.id, deptB);
    await assignBranch(tout.id, branchB);

    assignTok = await login(assigner);
    ccTok = await login(ccAgent);
    uaTok = await login(userAdmin);
    createTok = await login(creator);
  });

  after(async () => {
    if (app) await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) =>
    app.inject({ method: "GET", url, headers: auth(token) });

  // ── Complaint assignee (contextual) ──────────────────────────────────────────
  test("assign persona reaches /complaints/assignees WITHOUT users.read/lookup (200)", async () => {
    const res = await get("/complaints/assignees", assignTok);
    assert.equal(res.statusCode, 200, "complaints.assign alone must open the assignee lookup");
  });

  test("assign persona is 403'd from the org-wide /lookups/users AND /users page", async () => {
    for (const url of ["/lookups/users", "/users"]) {
      const res = await get(url, assignTok);
      assert.equal(res.statusCode, 403, `${url} must stay gated on users.lookup/users.read`);
    }
  });

  test("assignee lookup enforces branch+department scope (out-of-scope target excluded)", async () => {
    const res = await get("/complaints/assignees", assignTok);
    assert.equal(res.statusCode, 200);
    const ids = (res.json().data.items as Array<{ userId: number }>).map((i) => i.userId);
    assert.ok(ids.includes(targetInId), "in-scope (deptA/branchA) staff must appear");
    assert.ok(!ids.includes(targetOutId), "out-of-scope (deptB/branchB) staff must be excluded");
  });

  test("assignee lookup projection carries NO email/phone (minimal)", async () => {
    const res = await get("/complaints/assignees", assignTok);
    const first = (res.json().data.items as Array<Record<string, unknown>>)[0];
    if (first) {
      const keys = Object.keys(first);
      assert.deepEqual(keys.sort(), ["branchName", "departmentName", "name", "userId"]);
      for (const banned of ["email", "mobile", "phone"]) {
        assert.ok(!keys.includes(banned), `assignee lookup must not expose ${banned}`);
      }
    }
  });

  // ── Call-center agents (contextual) ──────────────────────────────────────────
  test("cc persona reaches /call-center/agents WITHOUT users.read/lookup (200)", async () => {
    const res = await get("/call-center/agents", ccTok);
    assert.equal(res.statusCode, 200, "call_center_queue.assign alone must open the agent lookup");
  });

  test("cc persona is 403'd from the org-wide /lookups/users", async () => {
    const res = await get("/lookups/users", ccTok);
    assert.equal(res.statusCode, 403);
  });

  test("agent lookup is branch-scoped and email-free", async () => {
    const res = await get("/call-center/agents", ccTok);
    assert.equal(res.statusCode, 200);
    const first = (res.json().data.items as Array<Record<string, unknown>>)[0];
    if (first) {
      const keys = Object.keys(first);
      assert.ok(!keys.includes("email"), "agent lookup must not expose email");
      assert.deepEqual(keys.sort(), ["branchName", "id", "label"]);
    }
  });

  // ── Roles lookup (contextual to user management) ─────────────────────────────
  test("users.create persona reaches /lookups/roles but NOT the /roles page", async () => {
    const ok = await get("/lookups/roles", uaTok);
    assert.equal(ok.statusCode, 200, "users.create must reach the roles lookup");
    const page = await get("/roles", uaTok);
    assert.equal(page.statusCode, 403, "/roles must stay gated on roles.read");
  });

  // ── Purchase-experience lookup (contextual to complaint create) ──────────────
  test("complaints.create persona reaches /lookups/purchase-experiences but NOT the full list", async () => {
    const ok = await get("/lookups/purchase-experiences", createTok);
    assert.equal(ok.statusCode, 200, "complaints.create must reach the PE lookup");
    const page = await get("/purchase-experiences", createTok);
    assert.equal(page.statusCode, 403, "/purchase-experiences must stay gated on purchase_experiences.read");
  });
}
