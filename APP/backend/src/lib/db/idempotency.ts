import type { PrismaClient } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";

export interface IdempotencyResult<T> {
  deduped: boolean;
  result?: T;
}

/**
 * Create-first idempotency. RESERVE a unique (scope, key) row BEFORE performing
 * the side effect — never "check then send" (that races). A unique-violation on
 * insert means the effect already fired, so we treat it as a dedupe (no-op).
 *
 * Use for: notifications, emails, webhook processing, critical external effects.
 */
export async function runIdempotent<T>(
  prisma: PrismaClient,
  params: { scope: string; key: string; expiresAt?: Date; resultRef?: string },
  effect: () => Promise<T>,
): Promise<IdempotencyResult<T>> {
  try {
    await prisma.idempotencyKey.create({
      data: {
        scope: params.scope,
        key: params.key,
        expiresAt: params.expiresAt,
        resultRef: params.resultRef,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { deduped: true };
    throw err;
  }

  const result = await effect();
  return { deduped: false, result };
}
