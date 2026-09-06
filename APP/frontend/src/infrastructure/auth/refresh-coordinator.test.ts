import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRefreshCoordinator } from "./refresh-coordinator.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createRefreshCoordinator", () => {
  it("shares one Backend call between concurrent callers", async () => {
    let calls = 0;
    const gate = deferred<string>();
    const refresh = createRefreshCoordinator(() => {
      calls += 1;
      return gate.promise;
    });

    const both = Promise.all([refresh("rt-1"), refresh("rt-1")]);
    gate.resolve("rotated");

    assert.deepEqual(await both, ["rotated", "rotated"]);
    assert.equal(calls, 1);
  });

  it("answers a late caller from the rotated result", async () => {
    let calls = 0;
    const refresh = createRefreshCoordinator(async () => {
      calls += 1;
      return `pair-${calls}`;
    });

    assert.equal(await refresh("rt-1"), "pair-1");
    assert.equal(await refresh("rt-1"), "pair-1");
    assert.equal(calls, 1);
  });

  it("stops answering from cache once the window passes", async () => {
    let calls = 0;
    let clock = 0;
    const refresh = createRefreshCoordinator(
      async () => {
        calls += 1;
        return `pair-${calls}`;
      },
      { ttlMs: 1000, now: () => clock },
    );

    assert.equal(await refresh("rt-1"), "pair-1");
    clock = 1500;
    assert.equal(await refresh("rt-1"), "pair-2");
    assert.equal(calls, 2);
  });

  it("refreshes each token independently", async () => {
    const seen: string[] = [];
    const refresh = createRefreshCoordinator(async (token: string) => {
      seen.push(token);
      return token.toUpperCase();
    });

    assert.equal(await refresh("rt-1"), "RT-1");
    assert.equal(await refresh("rt-2"), "RT-2");
    assert.deepEqual(seen, ["rt-1", "rt-2"]);
  });

  it("never caches a failure", async () => {
    let calls = 0;
    const refresh = createRefreshCoordinator(async () => {
      calls += 1;
      if (calls === 1) throw new Error("TOKEN_INVALID");
      return "pair-2";
    });

    await assert.rejects(() => refresh("rt-1"), /TOKEN_INVALID/);
    assert.equal(await refresh("rt-1"), "pair-2");
    assert.equal(calls, 2);
  });
});
