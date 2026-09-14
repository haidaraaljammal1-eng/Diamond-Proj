import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashMediaBytes,
  kindForDetectedMime,
  normalizeMediaCaption,
  sanitizeMediaFilename,
  sniffWhatsAppMedia,
  validateOutboundMedia,
} from "src/modules/whatsapp/whatsapp.media";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { WHATSAPP_PROTECTED_MEDIA_TYPES } from "src/modules/whatsapp/whatsapp.constants";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("whatsapp media", () => {
  it("sniffs supported outbound types and rejects mismatch", () => {
    assert.equal(sniffWhatsAppMedia(PNG), "image/png");
    assert.equal(kindForDetectedMime("image/png"), "IMAGE");
    const ok = validateOutboundMedia({
      bytes: PNG,
      declaredMime: "image/png",
      requestedKind: "IMAGE",
    });
    assert.equal(ok.kind, "IMAGE");
    assert.throws(
      () =>
        validateOutboundMedia({
          bytes: PNG,
          declaredMime: "image/png",
          requestedKind: "AUDIO",
        }),
    );
    assert.throws(() =>
      validateOutboundMedia({
        bytes: Buffer.from("not-media"),
        declaredMime: "text/plain",
        requestedKind: "DOCUMENT",
      }),
    );
  });

  it("rejects empty files and sanitizes filenames", () => {
    assert.throws(() =>
      validateOutboundMedia({
        bytes: Buffer.alloc(0),
        declaredMime: "image/png",
        requestedKind: "IMAGE",
      }),
    );
    assert.equal(sanitizeMediaFilename("../../etc/passwd"), "passwd");
    assert.equal(sanitizeMediaFilename("quote.pdf"), "quote.pdf");
    assert.equal(hashMediaBytes(PNG).length, 64);
  });

  it("allows captions on image/document/video and strips them for audio", () => {
    assert.equal(normalizeMediaCaption("IMAGE", "  hello  "), "hello");
    assert.equal(normalizeMediaCaption("AUDIO", "nope"), null);
    assert.equal(WHATSAPP_PROTECTED_MEDIA_TYPES.includes("STICKER"), true);
    assert.equal(WhatsAppErrorReason.MEDIA_UNAVAILABLE, "WHATSAPP_MEDIA_UNAVAILABLE");
    assert.equal(WhatsAppErrorReason.MEDIA_INVALID_TYPE, "WHATSAPP_MEDIA_INVALID_TYPE");
    assert.equal(WhatsAppErrorReason.MEDIA_TOO_LARGE, "WHATSAPP_MEDIA_TOO_LARGE");
  });
});
