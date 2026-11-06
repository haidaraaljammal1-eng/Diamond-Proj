import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { staffLoginRedirectPath } from "./force-staff-logout.ts";

describe("staffLoginRedirectPath", () => {
  it("includes reauth=1 so proxy and login page do not bounce to dashboard", () => {
    assert.equal(staffLoginRedirectPath("ar"), "/ar/login?reauth=1");
    assert.equal(staffLoginRedirectPath("en"), "/en/login?reauth=1");
  });

  it("can omit reauth when callers need a plain login URL", () => {
    assert.equal(staffLoginRedirectPath("ar", false), "/ar/login");
  });
});

/** Documented staff logout sequence (sidebar must not stop at router.refresh). */
describe("staff logout contract", () => {
  it("requires full navigation to login after signOut", () => {
    const steps = ["signOut({ redirect: false })", "location.replace(loginUrl)"];
    assert.deepEqual(steps, [
      "signOut({ redirect: false })",
      "location.replace(loginUrl)",
    ]);
  });
});
