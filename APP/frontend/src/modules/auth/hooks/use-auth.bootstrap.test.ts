import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors `useAuth` bootstrap rule (session `update()` keeps `user` while status is loading). */
function isAuthBootstrapLoading(status: string, hasUser: boolean): boolean {
  return status === "loading" && !hasUser;
}

describe("useAuth bootstrap loading", () => {
  it("does not treat permission sync update as full auth bootstrap", () => {
    assert.equal(isAuthBootstrapLoading("loading", true), false);
  });

  it("still blocks UI until the first session is known", () => {
    assert.equal(isAuthBootstrapLoading("loading", false), true);
  });
});
