import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWhapiHistoryMessage } from "src/modules/whatsapp/whapi.history.parse";

describe("whapi history parse", () => {
  it("skips group chats", () => {
    const parsed = parseWhapiHistoryMessage(
      { id: "m1", type: "text", from_me: false, chat_id: "1203@g.us" },
      "1203@g.us",
      null,
    );
    assert.equal(parsed, null);
  });

  it("parses direct inbound text", () => {
    const parsed = parseWhapiHistoryMessage(
      {
        id: "m2",
        type: "text",
        from_me: false,
        chat_id: "971511122233@s.whatsapp.net",
        timestamp: 1_700_000_000,
        text: { body: "hello" },
      },
      "971511122233@s.whatsapp.net",
      "Ali",
    );
    assert.ok(parsed);
    assert.equal(parsed!.fromMe, false);
    assert.equal(parsed!.textBody, "hello");
    assert.equal(parsed!.customerWaId, "971511122233");
  });

  it("parses image metadata without implying local media store", () => {
    const parsed = parseWhapiHistoryMessage(
      {
        id: "m3",
        type: "image",
        from_me: false,
        chat_id: "971511122233@s.whatsapp.net",
        image: { id: "media-abc123def456", mime_type: "image/jpeg" },
      },
      "971511122233@s.whatsapp.net",
      null,
    );
    assert.ok(parsed);
    assert.equal(parsed!.providerMediaId, "media-abc123def456");
    assert.equal(parsed!.messageType, "image");
  });
});
