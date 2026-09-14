import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSseFrame, type WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { WhatsAppRealtimePublisher } from "src/modules/whatsapp/whatsapp.realtime-publisher";

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
