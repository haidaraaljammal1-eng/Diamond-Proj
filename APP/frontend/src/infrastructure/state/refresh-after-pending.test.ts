import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refreshAfterPending } from "./refresh-after-pending.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("refreshAfterPending", () => {
  it("starts a new read after an older in-flight snapshot settles", async () => {
    const oldRead = deferred();
    const calls: string[] = [];
    let inFlight: Promise<void> | null = oldRead.promise;

    const refresh = refreshAfterPending(
      () => inFlight,
      async () => {
        calls.push("fresh");
      },
    );

    await Promise.resolve();
    assert.deepEqual(calls, []);
    inFlight = null;
    oldRead.resolve();
    await refresh;

    assert.deepEqual(calls, ["fresh"]);
  });

  it("still performs the authoritative read when the older read failed", async () => {
    const oldRead = deferred();
    let refreshed = false;
    let inFlight: Promise<void> | null = oldRead.promise;

    const refresh = refreshAfterPending(
      () => inFlight,
      async () => {
        refreshed = true;
      },
    );

    inFlight = null;
    oldRead.reject(new Error("old request failed"));
    await refresh;

    assert.equal(refreshed, true);
  });
});
