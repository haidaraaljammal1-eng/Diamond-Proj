import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canContinueFromLicense,
  licensePanelFromStatus,
} from "./license-view.ts";

describe("licensePanelFromStatus", () => {
  it("shows verifying while the upload is in flight", () => {
    assert.equal(licensePanelFromStatus("PENDING", true), "verifying");
    assert.equal(licensePanelFromStatus("VALID", true), "verifying");
  });

  it("maps backend verification statuses", () => {
    assert.equal(licensePanelFromStatus("PENDING", false), "idle");
    assert.equal(licensePanelFromStatus("VALID", false), "valid");
    assert.equal(licensePanelFromStatus("EXPIRED", false), "expired");
    assert.equal(licensePanelFromStatus("UNREADABLE", false), "unreadable");
    assert.equal(licensePanelFromStatus("REVIEW_REQUIRED", false), "review");
    assert.equal(licensePanelFromStatus("PROVIDER_UNAVAILABLE", false), "unavailable");
  });
});

describe("canContinueFromLicense", () => {
  it("allows continue only after VALID and a later server step", () => {
    assert.equal(canContinueFromLicense("VALID", "CONTRACT"), true);
    assert.equal(canContinueFromLicense("VALID", "LICENSE_VERIFICATION"), false);
    assert.equal(canContinueFromLicense("EXPIRED", "LICENSE_VERIFICATION"), false);
    assert.equal(canContinueFromLicense("UNREADABLE", "CONTRACT"), false);
    assert.equal(canContinueFromLicense("PROVIDER_UNAVAILABLE", "CONTRACT"), false);
  });
});
