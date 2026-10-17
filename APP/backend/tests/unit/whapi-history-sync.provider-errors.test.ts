import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRetriableWhapiHistoryError,
  whapiHistoryHttpError,
} from "src/modules/whatsapp/whatsapp.history-sync.provider-errors";

describe("whapi history provider errors", () => {
  it("treats 429 and 5xx as retriable", () => {
    assert.equal(isRetriableWhapiHistoryError(whapiHistoryHttpError("chats", 429)), true);
    assert.equal(isRetriableWhapiHistoryError(whapiHistoryHttpError("messages", 503)), true);
    assert.equal(isRetriableWhapiHistoryError(whapiHistoryHttpError("chats", 400)), false);
    assert.equal(isRetriableWhapiHistoryError(new Error("other")), false);
  });
});
