import type { Prisma } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { isUniqueViolation } from "src/lib/db/prisma-error";

/**
 * Transactional-outbox producer. Call INSIDE the same transaction as the business
 * state change so the event can never be lost on crash. `dedupeKey` is unique, so
 * re-running a producer (or retrying a transaction) never writes a duplicate event.
 * Payload MUST carry ids only — no PII / free text / tokens.
 */
export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
}

export async function writeOutboxEvent(tx: Tx, input: OutboxEventInput): Promise<void> {
  try {
    await tx.domainOutboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        dedupeKey: input.dedupeKey,
        payload: input.payload as Prisma.InputJsonValue,
        availableAt: input.availableAt,
      },
    });
  } catch (err) {
    // A duplicate event (same dedupeKey) is a no-op — the event is already durable.
    if (!isUniqueViolation(err)) throw err;
  }
}
