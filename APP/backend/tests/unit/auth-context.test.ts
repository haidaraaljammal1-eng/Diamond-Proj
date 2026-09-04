import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyRequest } from "fastify";
import {
  hasAnyPermission,
  hasPermission,
  requireAuth,
  type AuthUser,
} from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";

const auth: AuthUser = {
  id: 1,
  email: "a@b.c",
  status: "ACTIVE",
  permissions: ["users.read"],
  roleKeys: ["r"],
};

test("hasPermission checks a single permission", () => {
  assert.equal(hasPermission(auth, "users.read"), true);
  assert.equal(hasPermission(auth, "users.delete"), false);
});

test("hasAnyPermission is satisfied by one match", () => {
  assert.equal(hasAnyPermission(auth, ["x", "users.read"]), true);
  assert.equal(hasAnyPermission(auth, ["x", "y"]), false);
});

test("requireAuth throws AppError when identity is missing", () => {
  assert.throws(() => requireAuth({} as FastifyRequest), AppError);
});
