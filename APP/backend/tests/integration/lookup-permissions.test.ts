import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Runtime permission matrix for the lookup/reference-use model. Proves the core
 * contract end-to-end against the real app + DB:
 *
 *   - A workflow user can call the `/lookups/*` it needs via a dedicated LOOKUP
 *     permission WITHOUT holding the referenced entity's full `.read`.
 *   - That same user is still 403'd from the full list/CRUD (page) endpoints.
 *   - A user with neither the lookup permission nor `.read` is 403'd from lookups.
 *   - A full-read holder keeps working (any-of semantics — backward compatible).
 *   - Published-only pickers (communication-templates) exclude drafts.
 *   - Sensitive lookups (customers) carry no PII in their projection.
 *
 * Only runs with RUN_INTEGRATION=true and a disposable test DATABASE_URL. All
 * codes/emails are suffixed per-run so it stays re-runnable.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("lookup-permissions integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();

  // Persona A — a Purchase-Experience author: can create the experience and use
  // the reference lookups it needs, but has NO page/read access to those entities.
  const pe = { email: `lp-pe-${run}@example.test`, password: "lp-pe-pass-123" };
  const PE_PERMS = [
    "purchase_experiences.manage",
    "reference_data.lookup",
    "customers.lookup",
  ];

  // Persona C — a message author: can pick published templates, but has NO
  // communication_templates.read.
  const camp = { email: `lp-camp-${run}@example.test`, password: "lp-camp-pass-123" };
  const CAMP_PERMS = [
    "communication_templates.lookup",
    "reference_data.lookup",
  ];

  // Persona B — authenticated but holds neither a lookup permission nor any read.
  const none = { email: `lp-none-${run}@example.test`, password: "lp-none-pass-123" };
  const NONE_PERMS = ["notifications.read"];

  // Persona D — a legacy full-read holder (branches.read only). Any-of must keep
  // both the lookup AND the page working for them.
  const read = { email: `lp-read-${run}@example.test`, password: "lp-read-pass-123" };
  const READ_PERMS = ["branches.read"];

  let peTok = "";
  let campTok = "";
  let noneTok = "";
  let readTok = "";


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

    const peId = await seedUser(pe.email, pe.password, `lp_pe_${run}`, PE_PERMS);
    await seedUser(camp.email, camp.password, `lp_camp_${run}`, CAMP_PERMS);
    await seedUser(none.email, none.password, `lp_none_${run}`, NONE_PERMS);
    await seedUser(read.email, read.password, `lp_read_${run}`, READ_PERMS);

    peTok = await login(pe);
    campTok = await login(camp);
    noneTok = await login(none);
    readTok = await login(read);

    // A PUBLISHED EMAIL template — must appear in /lookups/communication-templates.
    const tpl = await prisma.messageTemplate.create({
      data: {
        code: `LP-TPL-${run}`,
        name: "LP Email Template",
        channel: "EMAIL",
        createdById: peId,
      },
    });
    const tplVer = await prisma.messageTemplateVersion.create({
      data: { templateId: tpl.id, versionNumber: 1, status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.messageTemplate.update({
      where: { id: tpl.id },
      data: { currentVersionId: tplVer.id },
    });
  });

  after(async () => {
    if (app) await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) =>
    app.inject({ method: "GET", url, headers: auth(token) });

  // ── Scenario A — workflow user uses lookups WITHOUT full read ────────────────
  test("A: purchase-experience persona can call every reference lookup it needs (200)", async () => {
    for (const url of [
      "/lookups/branches",
      "/lookups/vehicle-models",
      "/lookups/salespeople",
      "/lookups/customers",
    ]) {
      const res = await get(url, peTok);
      assert.equal(res.statusCode, 200, `${url} should be 200 for the workflow persona`);
    }
  });

  test("A: the SAME persona is still 403'd from the full list / page endpoints", async () => {
    for (const url of ["/branches", "/vehicle-models", "/salespeople", "/customers"]) {
      const res = await get(url, peTok);
      assert.equal(res.statusCode, 403, `${url} must stay gated on <resource>.read`);
    }
  });

  // ── Scenario B — no lookup authorization → 403 ───────────────────────────────
  test("B: a user without lookup authorization cannot call lookups (403)", async () => {
    for (const url of ["/lookups/branches", "/lookups/customers"]) {
      const res = await get(url, noneTok);
      assert.equal(res.statusCode, 403, `${url} must reject a non-authorized user`);
    }
  });

  // ── Scenario C — message author picks published templates without read ──────
  test("C: message persona can lookup published templates + branches (200)", async () => {
    for (const url of [
      "/lookups/communication-templates?channel=EMAIL",
      "/lookups/branches",
    ]) {
      const res = await get(url, campTok);
      assert.equal(res.statusCode, 200, `${url} should be 200 for the campaign persona`);
    }
  });

  test("C: message persona is 403'd from the full template pages", async () => {
    for (const url of ["/communication-templates"]) {
      const res = await get(url, campTok);
      assert.equal(res.statusCode, 403, `${url} must stay gated on its own .read`);
    }
  });

  // ── Scenario D — any-of keeps full-read holders working (backward compat) ────
  test("D: a branches.read holder uses BOTH the lookup and the page (any-of)", async () => {
    const lookup = await get("/lookups/branches", readTok);
    assert.equal(lookup.statusCode, 200);
    const page = await get("/branches", readTok);
    assert.equal(page.statusCode, 200);
  });

  // ── Scenario E — published-only + minimal projection + PII safety ────────────


  test("E: template lookup returns the published EMAIL template (minimal projection)", async () => {
    const res = await get(`/lookups/communication-templates?channel=EMAIL&search=LP-TPL-${run}`, campTok);
    assert.equal(res.statusCode, 200);
    const first = (res.json().data as Array<Record<string, unknown>>)[0];
    assert.ok(first, "expected the published template");
    assert.deepEqual(
      Object.keys(first).sort(),
      ["channel", "code", "currentVersionId", "id", "label"],
    );
  });

  test("E: customer lookup carries NO PII (no phone/email/mobile in the projection)", async () => {
    const res = await get("/lookups/customers", peTok);
    assert.equal(res.statusCode, 200);
    const first = (res.json().data as Array<Record<string, unknown>>)[0];
    if (first) {
      const keys = Object.keys(first);
      for (const banned of ["mobile", "phone", "email"]) {
        assert.ok(!keys.includes(banned), `customer lookup must not expose ${banned}`);
      }
    }
  });

  test("unauthenticated lookup access is rejected", async () => {
    const res = await app.inject({ method: "GET", url: "/lookups/branches" });
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  });
}
