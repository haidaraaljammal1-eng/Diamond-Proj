import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseWhapiWebhookBatch } from "src/modules/whatsapp/whapi.webhook-parse";
import { whapiWebhookEventChannelAccepted } from "src/modules/whatsapp/whapi.config";
import { commitVehicleVideoAfterFileOnDisk } from "src/modules/vehicles/vehicle-video-upload.orchestrator";
import { resolveStoragePath } from "src/lib/files/storage-key";

const directChat = "971500000001@s.whatsapp.net";

describe("Whapi webhook per-item channel resolution", () => {
  it("uses item channel_id when present and envelope only as fallback", () => {
    const batch = parseWhapiWebhookBatch(
      {
        channel_id: "envelope-office",
        messages: [
          {
            id: "m-local",
            channel_id: "item-office",
            from_me: false,
            type: "text",
            chat_id: directChat,
            timestamp: 1_790_000_001,
            text: { body: "local channel" },
          },
          {
            id: "m-fallback",
            from_me: false,
            type: "text",
            chat_id: directChat,
            timestamp: 1_790_000_002,
            text: { body: "envelope channel" },
          },
        ],
        statuses: [
          {
            id: "s-local",
            channel_id: "status-office",
            status: "delivered",
            timestamp: 1_790_000_003,
          },
          { id: "s-fallback", status: "read", timestamp: 1_790_000_004 },
        ],
        event: { type: "messages", event: "post" },
      },
      "mixed-channel-envelope",
    );

    const byKey = new Map(batch.map((item) => [item.providerMessageId, item.channelId]));
    assert.equal(byKey.get("m-local"), "item-office");
    assert.equal(byKey.get("m-fallback"), "envelope-office");
    assert.equal(byKey.get("s-local"), "status-office");
    assert.equal(byKey.get("s-fallback"), "envelope-office");
  });

  it("isolates foreign-channel items while keeping same-office payloads", () => {
    const configured = "office-chan";
    const batch = parseWhapiWebhookBatch(
      {
        channel_id: configured,
        messages: [
          {
            id: "keep-me",
            from_me: false,
            type: "text",
            chat_id: directChat,
            timestamp: 1_790_000_010,
            text: { body: "ok" },
          },
          {
            id: "drop-me",
            channel_id: "other-chan",
            from_me: false,
            type: "text",
            chat_id: directChat,
            timestamp: 1_790_000_011,
            text: { body: "foreign" },
          },
        ],
        event: { type: "messages", event: "post" },
      },
      "foreign-item",
    );

    const accepted = batch.filter((item) =>
      whapiWebhookEventChannelAccepted(configured, item.channelId),
    );
    const rejected = batch.filter(
      (item) => !whapiWebhookEventChannelAccepted(configured, item.channelId),
    );

    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]?.providerMessageId, "keep-me");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.providerMessageId, "drop-me");
    assert.equal(
      accepted[0]?.providerEventKey,
      batch.find((item) => item.providerMessageId === "keep-me")?.providerEventKey,
    );
    const retry = parseWhapiWebhookBatch(
      {
        channel_id: configured,
        messages: [
          {
            id: "keep-me",
            from_me: false,
            type: "text",
            chat_id: directChat,
            timestamp: 1_790_000_010,
            text: { body: "ok" },
          },
        ],
        event: { type: "messages", event: "post" },
      },
      "foreign-item-retry",
    );
    assert.equal(retry[0]?.providerEventKey, accepted[0]?.providerEventKey);
  });
});

describe("Vehicle video bytes-before-database commit", () => {
  it("commits database only after final storage bytes exist", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "diamond-video-"));
    const tempPath = join(storageDir, "incoming.tmp");
    const storageKey = "a1b2c3d4e5f6789012345678abcdef12.mp4";
    const finalPath = resolveStoragePath(storageDir, storageKey);
    await writeFile(tempPath, "fake-mp4-bytes");

    const phases: string[] = [];
    const { mkdir, rename, unlink } = await import("node:fs/promises");
    await commitVehicleVideoAfterFileOnDisk({
      storageDir,
      storageKey,
      tempPath,
      io: {
        mkdir,
        unlink,
        rename: async (from, to) => {
          phases.push("rename");
          await rename(from, to);
          await access(to);
        },
      },
      commitDatabase: async () => {
        phases.push("database");
        await access(finalPath);
        return { ok: true };
      },
    });

    assert.deepEqual(phases, ["rename", "database"]);
    await rm(storageDir, { recursive: true, force: true });
  });

  it("removes unreferenced bytes when database commit fails", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "diamond-video-"));
    const tempPath = join(storageDir, "incoming.tmp");
    const storageKey = "b2c3d4e5f6789012345678abcdef1234.mp4";
    const finalPath = resolveStoragePath(storageDir, storageKey);
    await writeFile(tempPath, "fake-mp4-bytes");

    await assert.rejects(
      () =>
        commitVehicleVideoAfterFileOnDisk({
          storageDir,
          storageKey,
          tempPath,
          commitDatabase: async () => {
            throw new Error("database unavailable");
          },
        }),
      /database unavailable/,
    );

    await assert.rejects(() => access(finalPath));
    await rm(storageDir, { recursive: true, force: true });
  });
});
