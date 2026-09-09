import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import {
  isReturnLinkGoneReason,
  resolvePublicReturnErrorMessage,
} from "./resolve-public-return-error.ts";
import { isReturnReceivedStatus } from "./return-view.ts";

function translator(keys: string[]) {
  const set = new Set(keys);
  return Object.assign((key: string) => key, {
    has: (key: string) => set.has(key),
  });
}

describe("resolvePublicReturnErrorMessage", () => {
  it("maps context.reason before HTTP code and never returns the raw backend message", () => {
    const t = translator([
      "error.CONTRACT_LINK_EXPIRED",
      "error.UNAUTHORIZED",
      "error.generic",
    ]);
    const message = resolvePublicReturnErrorMessage(
      t,
      new ApiRequestError(
        {
          code: "UNAUTHORIZED",
          message: "raw token expired internals",
          context: { reason: "CONTRACT_LINK_EXPIRED" },
        },
        401,
      ),
    );
    assert.equal(message, "error.CONTRACT_LINK_EXPIRED");
    assert.notEqual(message, "raw token expired internals");
  });
});

describe("isReturnLinkGoneReason", () => {
  it("treats invalid, expired and used as branded link states", () => {
    assert.equal(isReturnLinkGoneReason("CONTRACT_LINK_INVALID"), true);
    assert.equal(isReturnLinkGoneReason("CONTRACT_LINK_EXPIRED"), true);
    assert.equal(isReturnLinkGoneReason("CONTRACT_LINK_USED"), true);
    assert.equal(isReturnLinkGoneReason("NETWORK_ERROR"), false);
  });
});

describe("isReturnReceivedStatus", () => {
  it("treats REVIEW and CLOSED as office-received, not customer Car-In", () => {
    assert.equal(isReturnReceivedStatus("RETOUT"), false);
    assert.equal(isReturnReceivedStatus("REVIEW"), true);
    assert.equal(isReturnReceivedStatus("CLOSED"), true);
  });
});
