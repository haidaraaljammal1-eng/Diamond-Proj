import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "src/modules/contracts/contracts-status";
import { formatContractNumber } from "src/modules/contracts/contracts-number";
import { hashesEqual } from "src/modules/contracts/contracts-links";
import { hashToken } from "src/lib/security/tokens";
import {
  ALLOWED_TRANSITIONS,
  BLOCKING_CONTRACT_STATUSES,
  CONTRACT_LINK_TTL_SECONDS,
  CURRENT_RENTAL_STATUSES,
} from "src/modules/contracts/contracts.constants";
import {
  assertIdempotencyFingerprint,
  fingerprintIdempotentPayload,
} from "src/lib/db/idempotency";
import { AppError } from "src/lib/errors/app-error";
import type { ContractStatus } from "@prisma/client";

test("renewal link TTL is 48 hours", () => {
  assert.equal(CONTRACT_LINK_TTL_SECONDS.RENEWAL, 48 * 60 * 60);
});

test("happy-path transitions are allowed", () => {
  const path: ContractStatus[] = [
    "AWAITING",
    "FORM",
    "SIGNED",
    "PAID",
    "ACTIVE",
    "RETOUT",
    "REVIEW",
    "CLOSED",
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.equal(canTransition(path[i]!, path[i + 1]!), true, `${path[i]} → ${path[i + 1]}`);
  }
});

test("invalid jumps are rejected", () => {
  assert.equal(canTransition("AWAITING", "ACTIVE"), false);
  assert.equal(canTransition("ACTIVE", "CLOSED"), false);
  assert.equal(canTransition("RETOUT", "CLOSED"), false);
  assert.equal(canTransition("REVIEW", "ACTIVE"), false);
  assert.equal(canTransition("CLOSED", "AWAITING"), false);
  assert.equal(canTransition("CLOSED", "CLOSED"), false);
  assert.equal(ALLOWED_TRANSITIONS.CLOSED.length, 0);
});

test("contract numbers are year-scoped and zero-padded", () => {
  assert.equal(formatContractNumber(2026, 1), "DE-2026-000001");
  assert.equal(formatContractNumber(2026, 42), "DE-2026-000042");
});

test("token hashes are not the raw token and compare in constant time", () => {
  const raw = "opaque-token-value-never-stored";
  const digest = hashToken(raw);
  assert.notEqual(digest, raw);
  assert.equal(hashesEqual(digest, digest), true);
  assert.equal(hashesEqual(digest, hashToken("other")), false);
});

test("currentRental and blocking statuses are possession/reservation only", () => {
  assert.deepEqual([...CURRENT_RENTAL_STATUSES], ["PAID", "ACTIVE", "RETOUT"]);
  assert.deepEqual([...BLOCKING_CONTRACT_STATUSES], ["PAID", "ACTIVE", "RETOUT"]);
  assert.equal(CURRENT_RENTAL_STATUSES.includes("REVIEW"), false);
  assert.equal(BLOCKING_CONTRACT_STATUSES.includes("REVIEW"), false);
});

test("idempotency fingerprint matches same payload and rejects a mismatch", () => {
  const a = fingerprintIdempotentPayload({ method: "MANUAL", amount: null });
  const b = fingerprintIdempotentPayload({ method: "MANUAL", amount: null });
  const c = fingerprintIdempotentPayload({ method: "BANK_TRANSFER", amount: null });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.doesNotThrow(() => assertIdempotencyFingerprint(a, b));
  assert.throws(
    () => assertIdempotencyFingerprint(a, c),
    (err: unknown) => err instanceof AppError && err.context?.reason === "IDEMPOTENCY_KEY_CONFLICT",
  );
});
