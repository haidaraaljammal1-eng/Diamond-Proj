import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextRealtimeBackoffMs,
  parseSseFrames,
  validateRealtimeEvent,
} from "./whatsapp.realtime.ts";
import {
  resetWhatsAppRealtimeClientForTests,
  WhatsAppRealtimeClient,
} from "./whatsapp.realtime-client.ts";

function eventFrame(id: string, type: string, extra: Record<string, unknown> = {}): string {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({
    eventId: id,
    type,
    conversationId: "c1",
    messageId: "m1",
    occurredAt: "2026-09-12T10:00:00.000Z",
    ...extra,
  })}\n\n`;
}

describe("whatsapp realtime parser", () => {
  it("parses identifier envelopes and ignores heartbeats and unknown types", () => {
    const { events, rest } = parseSseFrames(
      `: ping\n\n${eventFrame("1", "whatsapp.message.received")}event: future.unknown\ndata: {"eventId":"2","type":"future.unknown"}\n\nid: 3\nevent: whatsapp.message.received\ndata: {"eventId":"3"`,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventId, "1");
    assert.equal(events[0]?.type, "whatsapp.message.received");
    assert.equal(JSON.stringify(events[0]).includes("textBody"), false);
    assert.equal(rest.includes("eventId"), true);
    assert.equal(validateRealtimeEvent({ type: "nope", eventId: "x" }), null);
  });

  it("uses bounded backoff", () => {
    assert.equal(nextRealtimeBackoffMs(0) >= 1000, true);
    assert.equal(nextRealtimeBackoffMs(0) <= 1250, true);
    assert.equal(nextRealtimeBackoffMs(8) >= 15_000, true);
    assert.equal(nextRealtimeBackoffMs(8) <= 15_250, true);
  });
});

describe("whatsapp realtime fetch client", () => {
  it("opens one authenticated stream, closes on release, and does not put a token in the URL", async () => {
    resetWhatsAppRealtimeClientForTests();
    let fetches = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      fetches += 1;
      const url = String(input);
      assert.equal(url.includes("token="), false);
      assert.equal(url.endsWith("/whatsapp/realtime"), true);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer test-access");
      assert.equal(headers.has("Last-Event-ID"), false);
      return {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start() {
            // Stay open until abort.
          },
        }),
      } as Response;
    };
    const client = new WhatsAppRealtimeClient({
      fetchImpl,
      apiUrl: "http://api.test",
      getAccessToken: async () => "test-access",
      isOnline: () => true,
    });
    const events: string[] = [];
    const a = client.addHandler({
      onEvent: (event) => events.push(event.eventId),
      onStatus: () => undefined,
      onReconnect: () => undefined,
    });
    const b = client.addHandler({
      onEvent: (event) => events.push(`b:${event.eventId}`),
      onStatus: () => undefined,
      onReconnect: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(fetches, 1);
    assert.equal(client.handlerCount, 2);
    b();
    assert.equal(client.handlerCount, 1);
    a();
    assert.equal(client.handlerCount, 0);
    assert.equal(events.length, 0);
  });

  it("does not retry 401/403 in a loop", async () => {
    resetWhatsAppRealtimeClientForTests();
    let fetches = 0;
    let authFailures = 0;
    const fetchImpl: typeof fetch = async () => {
      fetches += 1;
      return { ok: false, status: 401, body: null } as Response;
    };
    const client = new WhatsAppRealtimeClient({
      fetchImpl,
      apiUrl: "http://api.test",
      getAccessToken: async () => "expired",
      isOnline: () => true,
    });
    client.addHandler({
      onEvent: () => undefined,
      onStatus: () => undefined,
      onReconnect: () => undefined,
      onAuthFailure: () => {
        authFailures += 1;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fetches, 1);
    assert.equal(authFailures, 1);
    client.stop();
  });

  it("parses live frames from the stream without duplicating event ids in the client last-event header later", async () => {
    resetWhatsAppRealtimeClientForTests();
    const encoder = new TextEncoder();
    const fetchImpl: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(eventFrame("77", "whatsapp.message.received")));
          },
        }),
      }) as Response;
    const client = new WhatsAppRealtimeClient({
      fetchImpl,
      apiUrl: "http://api.test",
      getAccessToken: async () => "test-access",
      isOnline: () => true,
    });
    const seen: string[] = [];
    const off = client.addHandler({
      onEvent: (event) => seen.push(event.eventId),
      onStatus: () => undefined,
      onReconnect: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(seen, ["77"]);
    assert.equal(client.getLastEventId(), "77");
    off();
  });
});
