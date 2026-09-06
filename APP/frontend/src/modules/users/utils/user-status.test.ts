import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getUserStatusPresentation,
  isUserStatusToggleable,
  nextStatusAfterToggle,
} from "./user-status.ts";

describe("user status mapping", () => {
  it("maps ACTIVE to success presentation", () => {
    assert.deepEqual(getUserStatusPresentation("ACTIVE"), {
      translationKey: "statusActive",
      variant: "success",
    });
  });

  it("maps PENDING to warning presentation", () => {
    assert.deepEqual(getUserStatusPresentation("PENDING"), {
      translationKey: "statusPending",
      variant: "warning",
    });
  });

  it("allows toggle only for ACTIVE and SUSPENDED", () => {
    assert.equal(isUserStatusToggleable("ACTIVE"), true);
    assert.equal(isUserStatusToggleable("SUSPENDED"), true);
    assert.equal(isUserStatusToggleable("PENDING"), false);
  });

  it("flips ACTIVE/SUSPENDED", () => {
    assert.equal(nextStatusAfterToggle("ACTIVE"), "SUSPENDED");
    assert.equal(nextStatusAfterToggle("SUSPENDED"), "ACTIVE");
    assert.equal(nextStatusAfterToggle("PENDING"), null);
  });
});
