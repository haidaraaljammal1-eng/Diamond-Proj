import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import {
  VEHICLE_VIDEO_MUTATION_LOCK_NS,
  withVehicleVideoMutationLock,
} from "src/modules/vehicles/vehicle-video-upload.orchestrator";
import { advisoryLockKey } from "src/lib/db/advisory-lock";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("vehicle video mutation concurrency lock", () => {
  it("serializes same-vehicle mutations with pg_advisory_xact_lock on one transaction", async () => {
    const [lockA, lockB] = advisoryLockKey(VEHICLE_VIDEO_MUTATION_LOCK_NS, 7);
    const holders = new Map<string, number>();
    let peakConcurrency = 0;

    let mutex = Promise.resolve();
    const prisma = {
      $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
        const previous = mutex;
        let unlock!: () => void;
        mutex = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await previous;
        const tx = {
          $executeRawUnsafe: async (sql: string, a: number, b: number) => {
            assert.match(sql, /pg_advisory_xact_lock/);
            assert.equal(a, lockA);
            assert.equal(b, lockB);
            const key = `${a}:${b}`;
            assert.equal(holders.has(key), false, "xact lock must not overlap on one vehicle");
            holders.set(key, 1);
            peakConcurrency = Math.max(peakConcurrency, holders.size);
          },
        } as unknown as Tx;
        try {
          return await fn(tx);
        } finally {
          holders.delete(`${lockA}:${lockB}`);
          unlock();
        }
      },
    } as PrismaClient;

    let inFlight = 0;
    let peakInFlight = 0;

    await Promise.all([
      withVehicleVideoMutationLock(prisma, 7, async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await sleep(40);
        inFlight -= 1;
      }),
      withVehicleVideoMutationLock(prisma, 7, async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await sleep(40);
        inFlight -= 1;
      }),
    ]);

    assert.equal(peakConcurrency, 1);
    assert.equal(peakInFlight, 1);
  });
});
