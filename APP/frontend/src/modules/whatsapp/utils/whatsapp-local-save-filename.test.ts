import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInboundLocalMediaFilename,
  sanitizeLocalFileSegment,
  UNIDENTIFIED_SENDER_FOLDER,
  waIdToSaveFolderName,
} from "./whatsapp-local-save-filename.ts";
import type { WhatsAppMessageDto } from "../types/whatsapp.types.ts";

function message(partial: Partial<WhatsAppMessageDto>): WhatsAppMessageDto {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    direction: "INBOUND",
    messageType: "IMAGE",
    textBody: null,
    caption: null,
    mediaFilename: null,
    mediaMimeType: null,
    mediaSizeBytes: null,
    hasProtectedMedia: true,
    mediaExpired: false,
    templateName: null,
    templateLanguage: null,
    templatePreview: null,
    providerOccurredAt: "2026-10-17T12:00:00.000Z",
    receivedAt: "2026-10-17T12:00:00.000Z",
    providerStatus: null,
    sendState: null,
    location: null,
    contacts: null,
    reaction: null,
    interactive: null,
    ...partial,
  };
}

describe("local media filename", () => {
  it("maps JPEG bytes to .jpg even when the draft name lacks an extension", async () => {
    const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])], {
      type: "image/jpeg",
    });
    const name = await buildInboundLocalMediaFilename(
      message({ messageType: "IMAGE", mediaMimeType: "image/jpeg" }),
      jpeg,
    );
    assert.match(name, /\.jpg$/);
    assert.match(name, /^2026-10-17_/);
    assert.match(name, /_aaaaaaaa\./);
  });

  it("keeps PDF filename stem and uses sniffed .pdf extension", async () => {
    const pdf = new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])], {
      type: "application/pdf",
    });
    const name = await buildInboundLocalMediaFilename(
      message({
        messageType: "DOCUMENT",
        mediaFilename: "1035.pdf",
        mediaMimeType: "application/pdf",
      }),
      pdf,
    );
    assert.match(name, /1035/);
    assert.match(name, /\.pdf$/);
  });

  it("uses .ogg for voice when MIME is audio/ogg", async () => {
    const ogg = new Blob([Uint8Array.from([0x4f, 0x67, 0x67, 0x53])], { type: "audio/ogg" });
    const name = await buildInboundLocalMediaFilename(
      message({ messageType: "AUDIO", mediaMimeType: "audio/ogg" }),
      ogg,
    );
    assert.match(name, /\.ogg$/);
  });

  it("sanitizes phone folders from wa id digits only", () => {
    assert.equal(waIdToSaveFolderName("963984179466"), "963984179466");
    assert.equal(waIdToSaveFolderName("120363000000000001@g.us"), "group_120363000000000001_at_g.us");
    assert.equal(waIdToSaveFolderName("  "), null);
    assert.equal(UNIDENTIFIED_SENDER_FOLDER, "_unidentified");
    assert.equal(sanitizeLocalFileSegment("bad/name?"), "bad_name_");
  });
});
