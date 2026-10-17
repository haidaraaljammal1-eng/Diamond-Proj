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
});
