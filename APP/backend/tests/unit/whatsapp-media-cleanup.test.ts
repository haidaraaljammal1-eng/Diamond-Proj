import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { runWhatsAppMediaCleanupCycle } from "src/modules/whatsapp/whatsapp.media-cleanup";

describe("whatsapp media cleanup scheduling", () => {
  it("independent plugin skips when the general scheduler is enabled", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/plugins/whatsapp-media-cleanup.ts"),
      "utf8",
    );
    assert.match(source, /if \(env\.SCHEDULER_ENABLED\)/);
    assert.match(source, /using background scheduler/);
  });

  it("drains at most fifty batches per cycle to bound work per tick", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/modules/whatsapp/whatsapp.media-cleanup.ts"),
      "utf8",
    );
    assert.match(source, /batch < 50/);
    const retention = readFileSync(
      path.join(process.cwd(), "src/modules/whatsapp/whatsapp.media-retention.ts"),
      "utf8",
    );
    assert.match(retention, /CLEANUP_BATCH = 100/);
  });
});

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  it("whatsapp media cleanup lock integration skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp media cleanup advisory lock", () => {
    it("second concurrent cycle skips while the first holds the lock", async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("lock test requires haidara_test");
      }
      const { buildApp } = await import("src/app");
      const app = await buildApp();
      const prisma = app.prisma;
      const first = runWhatsAppMediaCleanupCycle(prisma);
      const second = runWhatsAppMediaCleanupCycle(prisma);
      const [a, b] = await Promise.all([first, second]);
      await app.close();
      const skipped = [a, b].filter((r) => r.skipped);
      assert.equal(skipped.length, 1, "exactly one cycle should lose the advisory lock");
    });
  });
}
