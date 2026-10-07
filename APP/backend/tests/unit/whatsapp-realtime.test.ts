import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSseFrame, type WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { WhatsAppRealtimePublisher } from "src/modules/whatsapp/whatsapp.realtime-publisher";

const REALTIME_ROUTE = join(
  process.cwd(),
  "src/modules/whatsapp/routes/admin/realtime/route.ts",
);

function sample(overrides?: Partial<WhatsAppRealtimeEvent>): WhatsAppRealtimeEvent {
  return {
    eventId: "42",
    type: "whatsapp.message.received",
    conversationId: "conv-1",
    messageId: "msg-1",
    connectionId: "conn-1",
    occurredAt: "2026-09-12T10:00:00.000Z",
    ...overrides,
  };
}

describe("whatsapp realtime SSE route lifecycle", () => {
  it("cleans up on response/socket close, not request close (GET SSE)", () => {
    const source = readFileSync(REALTIME_ROUTE, "utf8");
    assert.match(source, /reply\.raw\.on\("close", cleanup\)/);
    assert.match(source, /request\.raw\.on\("aborted", cleanup\)/);
    assert.doesNotMatch(source, /request\.raw\.on\("close", cleanup\)/);
  });

  it("applies shared CORS headers on hijacked SSE writeHead", () => {
    const source = readFileSync(REALTIME_ROUTE, "utf8");
    assert.match(source, /corsHeadersForOrigin/);
    assert.match(source, /\.\.\.corsHeadersForOrigin\(requestOrigin\)/);
  });
});

describe("whatsapp realtime envelope", () => {
  it("formats SSE frames without customer text or secrets", () => {
    const frame = formatSseFrame(sample());
    assert.match(frame, /^id: 42\n/);
    assert.match(frame, /event: whatsapp.message.received\n/);
    assert.match(frame, /data: \{/);
    assert.equal(frame.includes("Hello"), false);
    assert.equal(frame.includes("textBody"), false);
    assert.equal(frame.includes("accessToken"), false);
    assert.equal(frame.includes("credentialCiphertext"), false);
    assert.equal(frame.includes("verifyToken"), false);
    assert.equal(frame.includes("appSecret"), false);
    assert.equal(frame.includes("authorization"), false);
  });
});

describe("whatsapp realtime publisher", () => {
  it("dedupes by event id and removes subscribers on unsubscribe", () => {
    const hub = new WhatsAppRealtimePublisher();
    const seen: string[] = [];
    const off = hub.subscribe((event) => seen.push(event.eventId));
    hub.publish(sample({ eventId: "1" }));
    hub.publish(sample({ eventId: "1" }));
    hub.publish(sample({ eventId: "2" }));
    assert.deepEqual(seen, ["1", "2"]);
    off();
    hub.publish(sample({ eventId: "3" }));
    assert.deepEqual(seen, ["1", "2"]);
    assert.equal(hub.subscriberCount, 0);
  });

  it("allows multiple subscribers and ignores listener errors", () => {
    const hub = new WhatsAppRealtimePublisher();
    const a: string[] = [];
    hub.subscribe(() => {
      throw new Error("subscriber boom");
    });
    hub.subscribe((event) => a.push(event.eventId));
    hub.publish(sample({ eventId: "9" }));
    assert.deepEqual(a, ["9"]);
    assert.equal(hub.subscriberCount, 2);
  });
});
