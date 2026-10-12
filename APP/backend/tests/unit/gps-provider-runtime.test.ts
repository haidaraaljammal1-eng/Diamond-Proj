import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGpsProviderRuntime } from "src/modules/gps/gps-provider-runtime";

describe("GPS provider runtime", () => {
  it("resolves separate session managers by provider key", () => {
    const liveGpsManager = { provider: "LIVE_GPS" };
    const sevenStarsManager = { provider: "SEVEN_STARS" };
    const runtime = createGpsProviderRuntime(
      new Map([
        ["LIVE_GPS", liveGpsManager],
        ["SEVEN_STARS", sevenStarsManager],
      ]),
    );

    assert.strictEqual(runtime.getSessionManager("LIVE_GPS"), liveGpsManager);
    assert.strictEqual(runtime.getSessionManager("SEVEN_STARS"), sevenStarsManager);
    assert.notStrictEqual(
      runtime.getSessionManager("LIVE_GPS"),
      runtime.getSessionManager("SEVEN_STARS"),
    );
  });

  it("fails closed when a provider session manager is not configured", () => {
    const runtime = createGpsProviderRuntime(new Map());

    assert.throws(
      () => runtime.getSessionManager("SEVEN_STARS"),
      /session manager is not configured/,
    );
  });
});
