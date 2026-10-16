import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { parseWhapiWebhook } from "src/modules/whatsapp/whapi.webhook-parse";
import { isWhapiMediaId, readWhapiInboundMedia } from "src/modules/whatsapp/whapi.media-fields";
import { WhapiWhatsAppProvider } from "src/modules/whatsapp/providers/whapi.provider";
import { prepareWhatsAppVoice, resolveFfmpegExecutable } from "src/modules/whatsapp/whapi.voice";
import {
  WHATSAPP_MEDIA_RETENTION_MS,
  allocateMediaKey,
  buildMediaStoreRecord,
  markMediaStoreExpired,
  mediaStoreExpired,
  readMediaStore,
  readStoredMedia,
  resolveStoredMediaPath,
  storedMediaExists,
  writeStoredMedia,
} from "src/modules/whatsapp/whatsapp.media-store";
import { cleanupExpiredWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media-retention";
import { archiveWhatsAppMediaBytes } from "src/modules/whatsapp/whatsapp.media-archive";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("Whapi media fields", () => {
  it("reads the media id from the typed object and ignores a public link", () => {
    const fields = readWhapiInboundMedia({
      type: "image",
      image: {
        id: "jpeg-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57",
        mime_type: "image/jpeg",
        file_size: 1200,
        caption: "gate photo",
        link: "https://gate.whapi.cloud/media/not-used",
      },
    });
    assert.equal(fields.providerMediaId, "jpeg-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57");
    assert.equal(fields.mediaMimeType, "image/jpeg");
    assert.equal(fields.caption, "gate photo");
    assert.equal(fields.mediaSizeBytes, 1200);
    assert.equal(fields.voiceNote, false);
    assert.equal(isWhapiMediaId("../etc/passwd"), false);
    assert.equal(isWhapiMediaId("https://evil.example/file"), false);
  });

  it("keeps a document filename and marks a voice note", () => {
    const parsed = parseWhapiWebhook(
      {
        channel_id: "CHAN",
        messages: [
          {
            id: "msg-doc",
            from_me: false,
            type: "document",
            chat_id: "971500000099@s.whatsapp.net",
            timestamp: 1_700_000_000,
            document: {
              id: "pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57",
              mime_type: "application/pdf",
              filename: "contract.pdf",
            },
          },
        ],
      },
      "hash",
    );
    assert.equal(parsed.providerMediaId, "pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57");
    assert.equal(parsed.mediaFilename, "contract.pdf");
    assert.equal(parsed.messageType, "DOCUMENT");

    const voice = readWhapiInboundMedia({
      type: "voice",
      voice: { id: "oga-abcdef0123456789abcdef0123456789-804713c25d2b57", mime_type: "audio/ogg" },
    });
    assert.equal(voice.voiceNote, true);
    assert.equal(voice.providerMediaId, "oga-abcdef0123456789abcdef0123456789-804713c25d2b57");
  });
});

describe("shared media store", () => {
  it("rejects traversal and expires exactly 168 hours after ingestion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "diamond-wa-"));
    try {
      assert.throws(() => resolveStoredMediaPath(root, "../secret"));
      assert.throws(() => resolveStoredMediaPath(root, "aa/bb/not-a-uuid"));
      const written = await writeStoredMedia(root, PNG);
      const key = allocateMediaKey();
      assert.match(written.key, /^[a-f0-9]{2}\/[a-f0-9]{2}\/[0-9a-f-]{36}$/);
      assert.ok(key);
      const bytes = await readStoredMedia(root, written.key);
      assert.equal(bytes.equals(PNG), true);
      const info = await stat(path.join(root, written.key));
      assert.equal(info.isFile(), true);
      const ingested = new Date("2026-10-01T00:00:00.000Z");
      const record = buildMediaStoreRecord({
        key: written.key,
        sha256: written.sha256,
        bytes: PNG.length,
        ingestedAt: ingested,
        voice: true,
      });
      assert.equal(Date.parse(record.expiresAt) - ingested.getTime(), WHATSAPP_MEDIA_RETENTION_MS);
      assert.equal(mediaStoreExpired(record, new Date(ingested.getTime() + WHATSAPP_MEDIA_RETENTION_MS - 1)), false);
      const expiredAt = new Date(ingested.getTime() + WHATSAPP_MEDIA_RETENTION_MS);
      assert.equal(mediaStoreExpired(record, expiredAt), true);
      const cleared = markMediaStoreExpired({ mediaStore: record, whapi: { voice: true } }, expiredAt);
      assert.equal((cleared?.mediaStore as { key?: string }).key, undefined);
      assert.equal((cleared?.whapi as { voice: boolean }).voice, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not write a second file for the same message", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "diamond-wa-dup-"));
    const messageId = "11111111-1111-4111-8111-111111111111";
    let payload: unknown = null;
    const prisma = {
      whatsAppMessage: {
        findUnique: async () => ({ displayPayload: payload }),
        update: async ({ data }: { data: { displayPayload: unknown } }) => {
          payload = data.displayPayload;
          return { id: messageId };
        },
      },
    };
    try {
      const first = await archiveWhatsAppMediaBytes(prisma as never, messageId, PNG, false, new Date("2026-10-01T00:00:00.000Z"), root);
      const second = await archiveWhatsAppMediaBytes(prisma as never, messageId, PNG, false, new Date("2026-10-02T00:00:00.000Z"), root);
      assert.equal(first, true);
      assert.equal(second, true);
      const store = (payload as { mediaStore: { key: string; ingestedAt: string } }).mediaStore;
      assert.equal(store.ingestedAt, "2026-10-01T00:00:00.000Z");
      const expired = markMediaStoreExpired(payload, new Date("2026-10-09T00:00:00.000Z"));
      payload = expired;
      const blocked = await archiveWhatsAppMediaBytes(
        prisma as never,
        messageId,
        PNG,
        false,
        new Date("2026-10-09T00:00:00.000Z"),
        root,
      );
      assert.equal(blocked, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("deletes only an expired shared file and leaves the message record", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "diamond-wa-clean-"));
    const messageId = "22222222-2222-4222-8222-222222222222";
    try {
      const written = await writeStoredMedia(root, PNG);
      const ingested = new Date("2026-10-01T00:00:00.000Z");
      let payload: unknown = {
        mediaStore: buildMediaStoreRecord({
          key: written.key,
          sha256: written.sha256,
          bytes: PNG.length,
          ingestedAt: ingested,
          voice: false,
        }),
        captionKept: "gate photo",
      };
      let updates = 0;
      const prisma = {
        $queryRaw: async () => [{ id: messageId, payload }],
        whatsAppMessage: {
          update: async ({ data }: { data: { displayPayload: unknown } }) => {
            updates += 1;
            payload = data.displayPayload;
            return { id: messageId };
          },
        },
      };
      const early = await cleanupExpiredWhatsAppMedia(prisma as never, ingested, root);
      assert.equal(early.expired, 0);
      assert.equal(updates, 0);
      assert.equal(await storedMediaExists(root, written.key), true);
      const expiredAt = new Date(ingested.getTime() + WHATSAPP_MEDIA_RETENTION_MS);
      const result = await cleanupExpiredWhatsAppMedia(prisma as never, expiredAt, root);
      assert.equal(result.expired, 1);
      assert.equal(await storedMediaExists(root, written.key), false);
      const cleared = readMediaStore(payload);
      assert.equal(cleared?.expired, true);
      assert.equal(cleared?.key, "");
      assert.equal((payload as { captionKept: string }).captionKept, "gate photo");
      const again = await cleanupExpiredWhatsAppMedia(prisma as never, expiredAt, root);
      assert.equal(again.expired, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Whapi voice and download", () => {
  it("passes OGG through and posts it to /messages/voice", async () => {
    const ogg = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(16)]);
    const prepared = await prepareWhatsAppVoice(ogg, "audio/ogg");
    assert.equal(prepared.mimeType, "audio/ogg");
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ status: { text: "AUTH" } }), { status: 200 });
      }
      if (url.endsWith("/messages/voice")) {
        return new Response(JSON.stringify({ message: { id: "voice-1" } }), { status: 200 });
      }
      if (url.includes("/media/jpeg-")) {
        return new Response(PNG, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response("no", { status: 404 });
    };
    const provider = new WhapiWhatsAppProvider("https://gate.whapi.cloud", fetchImpl);
    const sent = await provider.sendOutboundMedia({
      accessToken: "token",
      phoneNumberId: "chan",
      toChatId: "971500000000@s.whatsapp.net",
      kind: "AUDIO",
      bytes: prepared.bytes,
      mimeType: prepared.mimeType,
      filename: "voice.ogg",
      voice: true,
    });
    assert.equal(sent.ok, true);
    assert.equal(calls.some((url) => url.endsWith("/messages/voice")), true);
    const meta = await provider.getMediaMetadata("token", "jpeg-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57");
    assert.equal(meta.ok, true);
    if (!meta.ok) return;
    const downloaded = await provider.downloadMedia("token", meta.value.url);
    assert.equal(downloaded.ok, true);
    if (downloaded.ok) assert.equal(downloaded.value.body.equals(PNG), true);
    const rejected = await provider.downloadMedia("token", "https://evil.example/file");
    assert.equal(rejected.ok, false);
  });

  it("converts WebM and MP4 to OGG with ffmpeg and removes the temp files", async (t) => {
    const binary = resolveFfmpegExecutable();
    const probe = spawnSync(binary, ["-hide_banner", "-version"], { windowsHide: true });
    if (probe.status !== 0) {
      t.skip("ffmpeg is not installed");
      return;
    }
    async function synthesize(format: "webm" | "mp4", codec: "libopus" | "aac"): Promise<Buffer> {
      const dir = await mkdtemp(path.join(tmpdir(), "diamond-wa-src-"));
      const output = path.join(dir, `tone.${format}`);
      try {
        const rendered = spawnSync(
          binary,
          ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3", "-c:a", codec, output],
          { windowsHide: true },
        );
        assert.equal(rendered.status, 0);
        const { readFile } = await import("node:fs/promises");
        return await readFile(output);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith("diamond-wa-voice-"));
    const webm = await synthesize("webm", "libopus");
    const mp4 = await synthesize("mp4", "aac");
    const fromWebm = await prepareWhatsAppVoice(webm, "audio/webm");
    const fromMp4 = await prepareWhatsAppVoice(mp4, "audio/mp4");
    assert.equal(fromWebm.mimeType, "audio/ogg");
    assert.equal(fromMp4.mimeType, "audio/ogg");
    assert.equal(fromWebm.bytes.subarray(0, 4).toString(), "OggS");
    assert.equal(fromMp4.bytes.subarray(0, 4).toString(), "OggS");
    const after = (await readdir(tmpdir())).filter((name) => name.startsWith("diamond-wa-voice-"));
    assert.deepEqual(after, before);
  });
});
