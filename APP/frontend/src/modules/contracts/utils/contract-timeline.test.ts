import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContractTimeline } from "./contract-timeline.ts";

describe("getContractTimeline", () => {
  it("highlights the current status and mutes upcoming steps", () => {
    const steps = getContractTimeline("PAID");
    assert.equal(steps[0]?.state, "done");
    assert.equal(steps[3]?.key, "paid");
    assert.equal(steps[3]?.state, "current");
    assert.equal(steps[4]?.state, "upcoming");
  });

  it("marks every step done when CLOSED", () => {
    const steps = getContractTimeline("CLOSED");
    assert.equal(steps.at(-1)?.state, "current");
    assert.ok(steps.slice(0, -1).every((step) => step.state === "done"));
  });
});
