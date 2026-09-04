import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * End-to-end security tests. These require a reachable PostgreSQL (they build
 * the real app and hit the DB), so they only run when RUN_INTEGRATION=true.
 * Point DATABASE_URL at a disposable test database before enabling.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("integration suite skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const creds = { email: "int-admin@example.test", password: "integration-pass-123" };
  let accessToken = "";
  let refreshToken = "";

  before(async () => {
    const { buildApp } = await import("src/app");
    const { hashPassword } = await import("src/lib/security/password");
    app = await buildApp();
    prisma = app.prisma;

    const perm = await prisma.permission.upsert({
      where: { key: "users.read" },
      update: {},
      create: { key: "users.read", category: "users", description: "View users" },
    });
    const role = await prisma.role.upsert({
      where: { key: "int_admin" },
      update: {},
      create: { key: "int_admin", name: "Integration Admin" },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
    const passwordHash = await hashPassword(creds.password);
    const user = await prisma.user.upsert({
      where: { email: creds.email },
      update: { status: "ACTIVE", passwordHash },
      create: { email: creds.email, name: "Integration", status: "ACTIVE", passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  });

  after(async () => {
    if (app) await app.close();
  });

  test("health endpoint is public and returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
  });

  test("protected route without a token is rejected", async () => {
    const res = await app.inject({ method: "GET", url: "/users" });
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  });

  test("wrong password is rejected; correct password issues tokens", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: creds.email, password: "wrong" },
    });
    assert.equal(bad.statusCode, 401);

    const ok = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
    assert.equal(ok.statusCode, 200);
    const body = ok.json();
    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
    assert.ok(accessToken.length > 0 && refreshToken.length > 0);
  });

  test("password is stored hashed, never in plaintext", async () => {
    const row = await prisma.user.findUniqueOrThrow({
      where: { email: creds.email },
      omit: { passwordHash: false },
    });
    assert.notEqual(row.passwordHash, creds.password);
    assert.match(row.passwordHash ?? "", /^\$argon2id\$/);
  });

  test("valid token authorizes /auth/me", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.email, creds.email);
  });

  test("invalid access token is rejected", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("permission-protected list succeeds with the required permission", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/users",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(res.statusCode, 200);
  });

  test("refresh rotates the token and reuse of the old token is rejected", async () => {
    const rotated = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    assert.equal(rotated.statusCode, 200);
    const newRefresh = rotated.json().data.refreshToken;
    assert.notEqual(newRefresh, refreshToken);

    const reuse = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    assert.equal(reuse.statusCode, 401);
    refreshToken = newRefresh;
  });

  test("suspended user cannot log in", async () => {
    await prisma.user.update({
      where: { email: creds.email },
      data: { status: "SUSPENDED" },
    });
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
    assert.equal(res.statusCode, 403);
    await prisma.user.update({
      where: { email: creds.email },
      data: { status: "ACTIVE" },
    });
  });
}
