import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStaffReauthLogin,
  readStaffReauthFromSearch,
  resolveStaffReauthRequested,
  shouldAutoRedirectStaffFromLoginScreen,
  shouldRedirectAuthenticatedStaffFromLogin,
} from "./staff-login-guard.ts";

describe("shouldRedirectAuthenticatedStaffFromLogin", () => {
  it("does not redirect when only session.user exists (revoked backend session)", () => {
    assert.equal(
      shouldRedirectAuthenticatedStaffFromLogin(
        { user: { id: "1", email: "a@b.c" } },
        false,
      ),
      false,
    );
  });

  it("redirects when staff session is fully usable", () => {
    assert.equal(
      shouldRedirectAuthenticatedStaffFromLogin(
        { user: { id: "1" }, accessToken: "live" },
        false,
      ),
      true,
    );
  });

  it("never redirects when reauth=1 even with live session", () => {
    assert.equal(
      shouldRedirectAuthenticatedStaffFromLogin(
        { user: { id: "1" }, accessToken: "live" },
        true,
      ),
      false,
    );
    assert.equal(
      shouldAutoRedirectStaffFromLoginScreen(
        { user: { id: "1" }, accessToken: "live" },
        true,
      ),
      false,
    );
  });
});

describe("isStaffReauthLogin", () => {
  it("detects reauth query flag", () => {
    assert.equal(isStaffReauthLogin({ reauth: "1" }), true);
    assert.equal(isStaffReauthLogin({ reauth: "0" }), false);
    assert.equal(isStaffReauthLogin(undefined), false);
    assert.equal(readStaffReauthFromSearch("?reauth=1&foo=2"), true);
    assert.equal(readStaffReauthFromSearch(""), false);
  });
});
