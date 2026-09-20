import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { ContractListItemDto } from "../types/contract.types";
import { getContractRowAction } from "./contract-row-action.ts";
import {
  CONTRACTS_REVALIDATE_INTERVAL_MS,
  CONTRACTS_REVALIDATE_MIN_GAP_MS,
  startContractsRevalidation,
  type RevalidationEnvironment,
} from "./contracts-revalidation.ts";
import { createListRequestGate } from "./list-request-gate.ts";

class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

function setup() {
  const win = new EventTarget();
  const doc = new FakeDocument();
  const refresh = mock.fn(() => Promise.resolve());
  const env: RevalidationEnvironment = {
    window: win as unknown as RevalidationEnvironment["window"],
    document: doc as unknown as RevalidationEnvironment["document"],
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    now: () => Date.now(),
  };
  const stop = startContractsRevalidation(() => refresh(), env);
  const setVisibility = (state: "visible" | "hidden") => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const focus = () => win.dispatchEvent(new Event("focus"));
  return { refresh, stop, setVisibility, focus };
}

/** Lets the refresh promise chain settle so the in-flight guard releases. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("startContractsRevalidation", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_000_000 }));
  afterEach(() => mock.timers.reset());

  it("refreshes when the window regains focus", () => {
    const { refresh, stop, focus } = setup();
    focus();
    assert.equal(refresh.mock.callCount(), 1);
    stop();
  });

  it("refreshes when the tab becomes visible again, never while hidden", async () => {
    const { refresh, stop, setVisibility, focus } = setup();
    setVisibility("hidden");
    focus();
    assert.equal(refresh.mock.callCount(), 0);
    mock.timers.tick(CONTRACTS_REVALIDATE_MIN_GAP_MS);
    setVisibility("visible");
    assert.equal(refresh.mock.callCount(), 1);
    await flush();
    stop();
  });

  it("polls while visible and pauses while hidden", async () => {
    const { refresh, stop, setVisibility } = setup();
    mock.timers.tick(CONTRACTS_REVALIDATE_INTERVAL_MS);
    await flush();
    mock.timers.tick(CONTRACTS_REVALIDATE_INTERVAL_MS);
    await flush();
    assert.equal(refresh.mock.callCount(), 2);

    setVisibility("hidden");
    mock.timers.tick(CONTRACTS_REVALIDATE_INTERVAL_MS * 4);
    assert.equal(refresh.mock.callCount(), 2);

    setVisibility("visible");
    await flush();
    assert.equal(refresh.mock.callCount(), 3);
    mock.timers.tick(CONTRACTS_REVALIDATE_INTERVAL_MS);
    await flush();
    assert.equal(refresh.mock.callCount(), 4);
    stop();
  });

  it("collapses a focus + visibility burst and never overlaps an in-flight refresh", async () => {
    const win = new EventTarget();
    const doc = new FakeDocument();
    let release: () => void = () => undefined;
    const refresh = mock.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const stop = startContractsRevalidation(() => refresh(), {
      window: win as unknown as RevalidationEnvironment["window"],
      document: doc as unknown as RevalidationEnvironment["document"],
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      now: () => Date.now(),
    });
    win.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(refresh.mock.callCount(), 1);

    mock.timers.tick(CONTRACTS_REVALIDATE_INTERVAL_MS);
    win.dispatchEvent(new Event("focus"));
    assert.equal(refresh.mock.callCount(), 1, "still in flight: no second request");

    release();
    await flush();
    mock.timers.tick(CONTRACTS_REVALIDATE_MIN_GAP_MS);
    win.dispatchEvent(new Event("focus"));
    assert.equal(refresh.mock.callCount(), 2);
    stop();
  });

  it("removes every listener and timer on cleanup", () => {
    const { refresh, stop, setVisibility, focus } = setup();
    stop();
    focus();
    setVisibility("hidden");
    setVisibility("visible");
    mock.timers.tick(CONTRACTS_REVALIDATE_INTERVAL_MS * 3);
    assert.equal(refresh.mock.callCount(), 0);
  });
});

describe("createListRequestGate", () => {
  it("joins a request for the same query instead of firing a second one", async () => {
    const gate = createListRequestGate();
    const task = mock.fn(async () => undefined);
    const first = gate.run("q1", task);
    const second = gate.run("q1", task);
    assert.equal(first, second);
    await first;
    assert.equal(task.mock.callCount(), 1);
    assert.equal(gate.current(), null);
  });

  it("marks an older query stale when a newer one starts, so it cannot overwrite", async () => {
    const gate = createListRequestGate();
    const applied: string[] = [];
    let releaseOld: () => void = () => undefined;
    const old = gate.run("page=1", async (isCurrent) => {
      await new Promise<void>((resolve) => { releaseOld = resolve; });
      if (isCurrent()) applied.push("old");
    });
    const next = gate.run("page=2", async (isCurrent) => {
      if (isCurrent()) applied.push("new");
    });
    await next;
    releaseOld();
    await old;
    assert.deepEqual(applied, ["new"]);
  });

  it("keeps the query key unchanged across a background refresh (filters preserved)", async () => {
    const gate = createListRequestGate();
    const key = JSON.stringify({ status: "PAID", search: "DE-2026", page: 2 });
    const keys: string[] = [];
    await gate.run(key, async () => { keys.push(key); });
    await gate.run(key, async () => { keys.push(key); });
    assert.deepEqual(keys, [key, key]);
  });
});

describe("refreshed list row", () => {
  function dto(status: ContractListItemDto["status"], canCarOut: boolean) {
    return { status, actions: { canCarOut, canCarIn: false } };
  }

  it("a PAID row from the refreshed list produces Car-Out", () => {
    assert.equal(getContractRowAction(dto("PAID", true))?.kind, "carOut");
  });

  it("status and action come from the same DTO: SIGNED -> PAID flips both together", () => {
    const before = dto("SIGNED", false);
    const after = dto("PAID", true);
    assert.equal(before.status, "SIGNED");
    assert.equal(getContractRowAction(before), null);
    assert.equal(after.status, "PAID");
    assert.equal(getContractRowAction(after)?.labelKey, "actions.carOut");
  });
});
