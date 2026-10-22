import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMp4Buffer, verifyMp4ContentType } from "src/lib/files/mp4";
import { parseByteRangeHeader } from "src/lib/files/range-stream";

describe("vehicle video helpers", () => {
  it("detects MP4 ftyp signature", () => {
    const sample = Buffer.alloc(32);
    sample.write("ftyp", 4, "latin1");
    assert.equal(isMp4Buffer(sample), true);
    const { ok, detected } = verifyMp4ContentType(sample, "video/mp4");
    assert.equal(ok, true);
    assert.equal(detected, "video/mp4");
  });

  it("parses byte ranges for streaming", () => {
    assert.deepEqual(parseByteRangeHeader("bytes=0-99", 1000), { start: 0, end: 99 });
    assert.deepEqual(parseByteRangeHeader("bytes=500-", 1000), { start: 500, end: 999 });
    assert.equal(parseByteRangeHeader("bytes=2000-", 1000), "invalid");
    assert.equal(parseByteRangeHeader(undefined, 1000), null);
  });
});
