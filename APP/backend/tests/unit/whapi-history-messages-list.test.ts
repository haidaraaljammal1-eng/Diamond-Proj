import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWhapiMessagesListHttpStatus,
  WHAPI_HISTORY_CHAT_SKIP,
} from "src/modules/whatsapp/whapi.history.messages-list";

describe("whapi messages list classification", () => {
  it("maps auth errors distinctly from skippable chats", () => {
    assert.equal(classifyWhapiMessagesListHttpStatus(401, "971501234567@s.whatsapp.net").kind, "auth_error");
    assert.equal(classifyWhapiMessagesListHttpStatus(403, "971501234567@s.whatsapp.net").kind, "auth_error");
  });

  it("classifies 400 on direct chats as unsupported list (not silent empty)", () => {
    const result = classifyWhapiMessagesListHttpStatus(400, "971501234567@s.whatsapp.net");
    assert.equal(result.kind, "skip_chat");
    if (result.kind === "skip_chat") {
      assert.equal(result.reasonCode, WHAPI_HISTORY_CHAT_SKIP.MESSAGES_LIST_UNSUPPORTED);
    }
  });

  it("classifies group chat 400 as unsupported chat id", () => {
    const result = classifyWhapiMessagesListHttpStatus(400, "1203@g.us");
    assert.equal(result.kind, "skip_chat");
    if (result.kind === "skip_chat") {
      assert.equal(result.reasonCode, WHAPI_HISTORY_CHAT_SKIP.UNSUPPORTED_CHAT_ID);
    }
  });

  it("treats 429 as provider error for retry layer", () => {
    assert.equal(classifyWhapiMessagesListHttpStatus(429, "971501234567@s.whatsapp.net").kind, "provider_error");
  });
});
