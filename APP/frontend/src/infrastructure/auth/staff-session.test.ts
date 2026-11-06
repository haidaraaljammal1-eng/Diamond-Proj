import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStaffSessionUsable } from "./staff-session.ts";

describe("isStaffSessionUsable", () => {
  it("rejects missing session", () => {
    assert.equal(isStaffSessionUsable(null), false);
    assert.equal(isStaffSessionUsable(undefined), false);
    assert.equal(isStaffSessionUsable({}), false);
  });

  it("rejects refresh failure marker", () => {
    assert.equal(
      isStaffSessionUsable({
        user: { id: "1" },
        accessToken: "tok",
        error: "RefreshAccessTokenError",
      }),
      false,
    );
  });

  it("rejects user shell without backend access token", () => {
    assert.equal(isStaffSessionUsable({ user: { id: "1" } }), false);
  });

  it("accepts a session with user and access token", () => {
    assert.equal(
      isStaffSessionUsable({
        user: { id: "1" },
        accessToken: "live-token",
      }),
      true,
    );
  });
});
