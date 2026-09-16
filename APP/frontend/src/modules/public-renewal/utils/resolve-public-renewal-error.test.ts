import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import {
  isRenewalLinkGoneReason,
  publicRenewalEditableFields,
  resolvePublicRenewalErrorMessage,
} from "./resolve-public-renewal-error.ts";

function translator(keys: string[]) {
  const set = new Set(keys);
  return Object.assign((key: string) => key, {
    has: (key: string) => set.has(key),
  });
}

describe("resolvePublicRenewalErrorMessage", () => {
  it("maps context.reason before HTTP code and never returns the raw backend message", () => {
    const t = translator([
      "error.CONTRACT_LINK_EXPIRED",
      "error.UNAUTHORIZED",
      "error.generic",
    ]);
    const message = resolvePublicRenewalErrorMessage(
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

describe("isRenewalLinkGoneReason", () => {
  it("treats invalid, expired and used as branded link states", () => {
    assert.equal(isRenewalLinkGoneReason("CONTRACT_LINK_INVALID"), true);
    assert.equal(isRenewalLinkGoneReason("CONTRACT_LINK_EXPIRED"), true);
    assert.equal(isRenewalLinkGoneReason("CONTRACT_LINK_USED"), true);
    assert.equal(isRenewalLinkGoneReason("NETWORK_ERROR"), false);
  });
});

describe("publicRenewalEditableFields", () => {
  it("keeps amount, duration, vehicle and contract identity server-owned", () => {
    assert.deepEqual([...publicRenewalEditableFields()], []);
  });
});
