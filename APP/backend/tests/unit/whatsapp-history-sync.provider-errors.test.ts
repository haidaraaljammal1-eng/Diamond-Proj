import { test } from "node:test";
import assert from "node:assert/strict";
import { WhapiHttpError } from "src/modules/whatsapp/providers/whapi.client";
import {
  historySyncFailureCode,
  isRetriableWhapiHistoryError,
  isWhapiHistoryNetworkError,
} from "src/modules/whatsapp/whatsapp.history-sync.provider-errors";

test("history sync provider errors classify network and HTTP", () => {
  assert.equal(isWhapiHistoryNetworkError(new WhapiHttpError("SEND_UNKNOWN", null)), true);
  assert.equal(isRetriableWhapiHistoryError(new WhapiHttpError("SEND_UNKNOWN", null)), true);
  assert.equal(isRetriableWhapiHistoryError(new Error("whapi_groups_http_503")), true);
  assert.equal(isRetriableWhapiHistoryError(new Error("whapi_chats_http_400")), false);
  assert.equal(historySyncFailureCode(new Error("whapi_chats_http_429")), "WHATSAPP_HISTORY_SYNC_PROVIDER_RATE_LIMITED");
  assert.equal(historySyncFailureCode(new Error("whapi_groups_http_502")), "WHATSAPP_HISTORY_SYNC_PROVIDER_UNAVAILABLE");
  assert.equal(historySyncFailureCode(new WhapiHttpError("SEND_UNKNOWN", null)), "WHATSAPP_HISTORY_SYNC_PROVIDER_NETWORK");
});
