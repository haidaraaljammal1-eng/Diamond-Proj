import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import { isUniqueViolation } from "src/lib/db/prisma-error";

export interface IdempotencyResult<T> {
  deduped: boolean;
  result?: T;
}

/** Stable SHA-256 of a JSON payload — never log the raw payload. */
export function fingerprintIdempotentPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function assertIdempotencyFingerprint(
  stored: string | null | undefined,
  incoming: string | undefined,
): void {
  if (!incoming || !stored) return;
  if (stored !== incoming) {
    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: "Idempotency key was reused with a different request",
      context: { reason: "IDEMPOTENCY_KEY_CONFLICT" },
    });
  }
}

/**
 * Create-first idempotency. RESERVE a unique (scope, key) row BEFORE performing
 * the side effect — never "check then send" (that races). A unique-violation on
 * insert means the effect already fired, so we treat it as a dedupe (no-op)
 * when the optional fingerprint matches. A mismatched fingerprint is CONFLICT.
 *
 * Use for: notifications, emails, webhook processing, critical external effects.
 */
export async function runIdempotent<T>(
  prisma: PrismaClient,
  params: {
    scope: string;
    key: string;
    expiresAt?: Date;
    resultRef?: string;
    fingerprint?: string;
  },
  effect: () => Promise<T>,
): Promise<IdempotencyResult<T>> {
  const resultRef = params.fingerprint ?? params.resultRef;
  try {
    await prisma.idempotencyKey.create({
      data: {
        scope: params.scope,
        key: params.key,
        expiresAt: params.expiresAt,
        resultRef,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    if (params.fingerprint) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope: params.scope, key: params.key } },
      });
      assertIdempotencyFingerprint(existing?.resultRef, params.fingerprint);
    }
    return { deduped: true };
  }

  const result = await effect();
  return { deduped: false, result };
}
