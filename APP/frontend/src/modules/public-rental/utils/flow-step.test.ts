import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEnterStage,
  isLinkGoneReason,
  progressIndex,
  uiStageFromFlowStep,
} from "./flow-step.ts";

describe("uiStageFromFlowStep", () => {
  it("maps server flow.step to the three customer stages plus handover", () => {
    assert.equal(uiStageFromFlowStep("LICENSE_VERIFICATION"), "license");
    assert.equal(uiStageFromFlowStep("CONTRACT"), "contract");
    assert.equal(uiStageFromFlowStep("PAYMENT"), "payment");
    assert.equal(uiStageFromFlowStep("READY_FOR_HANDOVER"), "handover");
  });
});

describe("canEnterStage", () => {
  it("blocks jumping ahead of the server-allowed stage", () => {
    assert.equal(canEnterStage("payment", "license"), false);
    assert.equal(canEnterStage("payment", "contract"), false);
    assert.equal(canEnterStage("contract", "license"), false);
    assert.equal(canEnterStage("license", "contract"), true);
    assert.equal(canEnterStage("payment", "payment"), true);
  });
});

describe("progressIndex", () => {
  it("keeps payment and handover on the third indicator", () => {
    assert.equal(progressIndex("LICENSE_VERIFICATION"), 0);
    assert.equal(progressIndex("CONTRACT"), 1);
    assert.equal(progressIndex("PAYMENT"), 2);
    assert.equal(progressIndex("READY_FOR_HANDOVER"), 2);
  });
});

describe("isLinkGoneReason", () => {
  it("recognizes invalid, expired and used rental links", () => {
    assert.equal(isLinkGoneReason("CONTRACT_LINK_INVALID"), true);
    assert.equal(isLinkGoneReason("CONTRACT_LINK_EXPIRED"), true);
    assert.equal(isLinkGoneReason("CONTRACT_LINK_USED"), true);
    assert.equal(isLinkGoneReason("PAYMENT_NOT_ALLOWED"), false);
  });
});
