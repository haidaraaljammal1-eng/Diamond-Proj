import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  releaseHistorySyncRunLock,
  tryAcquireHistorySyncRunLock,
} from "src/modules/whatsapp/whatsapp.history-sync.run-lock";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  it("whatsapp history sync advisory lock skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp history sync advisory lock", () => {
    const prismaA = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }),
    });
    const prismaB = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }),
    });
    const runId = randomUUID();

    before(async () => {
      await prismaA.$connect();
      await prismaB.$connect();
    });

    after(async () => {
      await releaseHistorySyncRunLock(prismaA, runId);
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    });

    it("allows only one session holder per run id", async () => {
      const first = await tryAcquireHistorySyncRunLock(prismaA, runId);
      const second = await tryAcquireHistorySyncRunLock(prismaB, runId);
      assert.equal(first, true);
      assert.equal(second, false);
      await releaseHistorySyncRunLock(prismaA, runId);
      const third = await tryAcquireHistorySyncRunLock(prismaB, runId);
      assert.equal(third, true);
      await releaseHistorySyncRunLock(prismaB, runId);
    });
  });
}
