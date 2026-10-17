import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("WhatsApp message bubble media UI", () => {
  const bubble = readFileSync(join(import.meta.dirname, "message-bubble.tsx"), "utf8");
  const voice = readFileSync(
    join(import.meta.dirname, "..", "voice-message-player", "voice-message-player.tsx"),
    "utf8",
  );

  it("hides inline download for inbound images while keeping lightbox manual save", () => {
    assert.match(bubble, /inboundImage/);
    assert.match(bubble, /showInlineDownload = !inboundImage/);
    assert.match(bubble, /whatsapp-image-manual-save/);
    const imageBranch = bubble.split("if (kind === \"IMAGE\"")[1]?.split("if (kind === \"AUDIO\")")[0] ?? "";
    assert.doesNotMatch(imageBranch, /\{download\}/);
  });

  it("uses the custom voice player without a download link", () => {
    assert.match(bubble, /WhatsAppVoiceMessagePlayer/);
    assert.doesNotMatch(bubble, /<audio className=\{styles\.player\} controls/);
    assert.match(voice, /formatAudioClock/);
    assert.match(voice, /loadedmetadata/);
    assert.match(voice, /type="range"/);
  });
});
