import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError, isAppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

test("AppError derives a default status from its code", () => {
  const notFound = AppError.notFound();
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.code, ErrorCode.NOT_FOUND);

  assert.equal(AppError.forbidden().statusCode, 403);
  assert.equal(AppError.unauthorized().statusCode, 401);
  assert.equal(AppError.conflict().statusCode, 409);
});

test("isAppError recognizes AppError instances", () => {
  assert.equal(isAppError(AppError.forbidden()), true);
  assert.equal(isAppError(new Error("plain")), false);
});
