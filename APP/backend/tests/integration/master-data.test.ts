import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * End-to-end master-data tests (regions/cities/branches + lookups). They build
 * the real app and hit the DB, so they only run when RUN_INTEGRATION=true with a
 * disposable test DATABASE_URL. Codes are suffixed per-run to stay re-runnable.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("master-data integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = { email: `md-admin-${run}@example.test`, password: "md-admin-pass-123" };
  const reader = { email: `md-reader-${run}@example.test`, password: "md-reader-pass-123" };
  let adminToken = "";
  let readerToken = "";
  let regionId = 0;
  const regionCode = `RG-${run}`;

  const MANAGE_PERMS = [
    "regions.read",
    "regions.manage",
    "cities.read",
    "cities.manage",
    "branches.read",
    "branches.manage",
  ];

  async function seedUser(
    email: string,
    password: string,
    roleKey: string,
    permKeys: string[],
  ) {
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
    await seedUser(admin.email, admin.password, `md_admin_${run}`, MANAGE_PERMS);
    await seedUser(reader.email, reader.password, `md_reader_${run}`, ["regions.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);
  });

  after(async () => {
    if (app) await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  test("create region (201) then normalized duplicate code is rejected (409 CONFLICT)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/regions",
      headers: auth(adminToken),
      payload: { code: regionCode, name: "Central Region" },
    });
    assert.equal(created.statusCode, 201);
    const body = created.json();
    regionId = body.data.id;
    assert.equal(body.data.code, regionCode);
    assert.equal(body.data.isActive, true);

    // Same code lower-cased must collide on the normalized value.
    const dup = await app.inject({
      method: "POST",
      url: "/regions",
      headers: auth(adminToken),
      payload: { code: regionCode.toLowerCase(), name: "Dup" },
    });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.json().error.code, "CONFLICT");
  });

  test("create city with an unknown regionId is rejected (422 invalid_parent)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cities",
      headers: auth(adminToken),
      payload: { code: `CT-BAD-${run}`, name: "Nowhere", regionId: 999999999 },
    });
    assert.equal(res.statusCode, 422);
    const err = res.json().error;
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.equal(err.context.reason, "invalid_parent");
    assert.equal(err.context.field, "regionId");
  });

  test("create city under the valid region (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cities",
      headers: auth(adminToken),
      payload: { code: `CT-${run}`, name: "Downtown", regionId },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().data.regionId, regionId);
  });

  test("deactivate hides the region from lookups; reactivate restores it", async () => {
    const off = await app.inject({
      method: "POST",
      url: `/regions/${regionId}/deactivate`,
      headers: auth(adminToken),
    });
    assert.equal(off.statusCode, 200);
    assert.equal(off.json().data.isActive, false);

    const hidden = await app.inject({
      method: "GET",
      url: `/lookups/regions?search=${regionCode}`,
      headers: auth(adminToken),
    });
    assert.equal(hidden.statusCode, 200);
    assert.equal(
      hidden.json().data.find((r: { id: number }) => r.id === regionId),
      undefined,
    );

    const on = await app.inject({
      method: "POST",
      url: `/regions/${regionId}/reactivate`,
      headers: auth(adminToken),
    });
    assert.equal(on.statusCode, 200);
    assert.equal(on.json().data.isActive, true);
  });

  test("lookup returns lightweight {id,label,code} items and honors limit", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/lookups/regions?limit=5",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const items = res.json().data as Array<Record<string, unknown>>;
    assert.ok(items.length <= 5);
    const first = items[0];
    if (first) {
      assert.deepEqual(Object.keys(first).sort(), ["code", "id", "label"]);
    }
  });

  test("list returns the standard paginated envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/regions?page=1&pageSize=10",
      headers: auth(adminToken),
    });
    assert.equal(res.statusCode, 200);
    const meta = res.json().meta;
    assert.deepEqual(Object.keys(meta).sort(), ["page", "pageSize", "total", "totalPages"]);
  });

  test("code is immutable: PUT with a changed code is rejected (422 immutable_field)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/regions/${regionId}`,
      headers: auth(adminToken),
      payload: { code: `RG-NEW-${run}`, name: "Renamed" },
    });
    assert.equal(res.statusCode, 422);
    const err = res.json().error;
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.equal(err.context.reason, "immutable_field");
    assert.equal(err.context.field, "code");

    // The rejected update must not have persisted the name either.
    const after = await app.inject({
      method: "GET",
      url: `/regions/${regionId}`,
      headers: auth(adminToken),
    });
    assert.notEqual(after.json().data.name, "Renamed");
  });

  test("update accepts a name change alongside the unchanged code (200)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/regions/${regionId}`,
      headers: auth(adminToken),
      payload: { code: regionCode.toLowerCase(), name: "Central Region v2" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.name, "Central Region v2");
    assert.equal(res.json().data.code, regionCode);
  });

  test("read permission does not grant manage: reader cannot create (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/regions",
      headers: auth(readerToken),
      payload: { code: `RG-X-${run}`, name: "Blocked" },
    });
    assert.equal(res.statusCode, 403);
  });

  test("reader with regions.read can list regions (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/regions",
      headers: auth(readerToken),
    });
    assert.equal(res.statusCode, 200);
  });

  test("unauthenticated access to a lookup is rejected", async () => {
    const res = await app.inject({ method: "GET", url: "/lookups/regions" });
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  });
}
