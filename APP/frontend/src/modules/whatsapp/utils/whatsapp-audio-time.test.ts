import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAudioClock } from "./whatsapp-audio-time.ts";

describe("formatAudioClock", () => {
  it("formats real durations as m:ss", () => {
    assert.equal(formatAudioClock(0), "0:00");
    assert.equal(formatAudioClock(65), "1:05");
    assert.equal(formatAudioClock(125.9), "2:05");
  });

  it("returns placeholder when duration is unknown", () => {
    assert.equal(formatAudioClock(null), "--:--");
    assert.equal(formatAudioClock(Number.NaN), "--:--");
  });
});
