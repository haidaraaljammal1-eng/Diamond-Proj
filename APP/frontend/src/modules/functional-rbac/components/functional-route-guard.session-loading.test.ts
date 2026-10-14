import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldShowFunctionalRouteGuardLoading } from "./functional-route-guard.session-loading.ts";

describe("FunctionalRouteGuard session bootstrap loading", () => {
  it("shows loading only on initial session bootstrap (no user yet)", () => {
    assert.equal(shouldShowFunctionalRouteGuardLoading("loading", false), true);
    assert.equal(shouldShowFunctionalRouteGuardLoading("loading", true), false);
  });

  it("does not treat authenticated or unauthenticated as bootstrap loading", () => {
    assert.equal(shouldShowFunctionalRouteGuardLoading("authenticated", true), false);
    assert.equal(shouldShowFunctionalRouteGuardLoading("authenticated", false), false);
    assert.equal(shouldShowFunctionalRouteGuardLoading("unauthenticated", false), false);
  });
});
