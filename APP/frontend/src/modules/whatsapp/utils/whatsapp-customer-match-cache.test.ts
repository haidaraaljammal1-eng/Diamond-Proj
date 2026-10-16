import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCustomerMatchLoader } from "./whatsapp-customer-match-cache.ts";
import {
  readWhatsAppRealtimeTrace,
  resetWhatsAppRealtimeTraceForTests,
  traceWhatsAppRealtime,
} from "./whatsapp-realtime-trace.ts";

describe("customer-match request control", () => {
  it("shares one in-flight request and then serves the cached match", async () => {
    let calls = 0;
    let release: (match: { state: "NO_MATCH" }) => void = () => undefined;
    const gate = new Promise<{ state: "NO_MATCH" }>((resolve) => {
      release = resolve;
    });
    const loader = createCustomerMatchLoader(async () => {
      calls += 1;
      return gate;
    });
    const first = loader.load("conversation-a");
    const second = loader.load("conversation-a");
    assert.equal(calls, 1);
    release({ state: "NO_MATCH" });
    const [left, right] = await Promise.all([first, second]);
    assert.equal(left.state, "NO_MATCH");
    assert.equal(right, left);
    await loader.load("conversation-a");
    assert.equal(calls, 1);
  });

  it("does not call the server again after HTTP 429 until refresh invalidates", async () => {
    let now = 10_000;
    let calls = 0;
    const loader = createCustomerMatchLoader(
      async () => {
        calls += 1;
        throw Object.assign(new Error("limited"), { status: 429 });
      },
      { now: () => now, blockMs: 60_000 },
    );
    await assert.rejects(() => loader.load("conversation-b"));
    await assert.rejects(() => loader.load("conversation-b"));
    now += 1_000;
    await assert.rejects(() => loader.load("conversation-b"));
    assert.equal(calls, 1);
    loader.invalidate("conversation-b");
    await assert.rejects(() => loader.load("conversation-b"));
    assert.equal(calls, 2);
  });

  it("loads again after an explicit invalidate", async () => {
    let calls = 0;
    const loader = createCustomerMatchLoader(async () => {
      calls += 1;
      return { state: "NO_SAFE_MATCH" as const };
    });
    await loader.load("conversation-c");
    loader.invalidate();
    await loader.load("conversation-c");
    assert.equal(calls, 2);
  });
});

describe("whatsapp realtime stage marks", () => {
  it("records event then applied without a payload", () => {
    resetWhatsAppRealtimeTraceForTests();
    traceWhatsAppRealtime("event", "whatsapp.message.received");
    traceWhatsAppRealtime("applied", "whatsapp.message.received");
    const trace = readWhatsAppRealtimeTrace();
    assert.deepEqual(
      trace.map((mark) => mark.stage),
      ["event", "applied"],
    );
    assert.equal(trace[0]?.eventType, "whatsapp.message.received");
    assert.equal("text" in (trace[0] ?? {}), false);
  });
});
