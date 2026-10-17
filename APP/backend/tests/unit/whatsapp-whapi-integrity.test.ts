import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWhapiWebhookBatch } from "src/modules/whatsapp/whapi.webhook-parse";
import { choosePendingEchoCandidate } from "src/modules/whatsapp/whatsapp.echo-match";
import { isNewerConversationMessage, inboundCountsAsUnread } from "src/modules/whatsapp/whatsapp.message-type";
import { nextProviderStatus } from "src/modules/whatsapp/whatsapp.status";
import {
  mergeWhapiRevision,
  readWhapiRevisionFlags,
} from "src/modules/whatsapp/whatsapp.message-revision";
import { shouldResyncWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { webhookFailureDisposition } from "src/modules/whatsapp/whapi.webhook.service";

describe("Whapi webhook batches", () => {
  it("parses every message and every status", () => {
    const batch = parseWhapiWebhookBatch(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m1",
            from_me: false,
            type: "text",
            chat_id: "971500000001@s.whatsapp.net",
            timestamp: 1_790_000_001,
            text: { body: "one" },
          },
          {
            id: "m2",
            from_me: true,
            type: "text",
            chat_id: "971500000002@s.whatsapp.net",
            timestamp: 1_790_000_002,
            source: "mobile",
            text: { body: "two" },
          },
        ],
        statuses: [
          { id: "m1", status: "delivered", timestamp: 1_790_000_003 },
          { id: "m2", status: "read", timestamp: 1_790_000_004 },
        ],
        event: { type: "messages", event: "post" },
      },
      "env-batch",
    );
    assert.equal(batch.length, 4);
    assert.deepEqual(
      batch.map((item) => item.providerEventKey),
      [
        "whapi:status:m1:delivered",
        "whapi:status:m2:read",
        "whapi:message:m1",
        "whapi:message:m2",
      ],
    );
    assert.equal(batch[3]?.fromMe, true);
    assert.equal(batch[3]?.source, "mobile");
  });

  it("gives edits and deletions their own idempotency keys", () => {
    const edited = parseWhapiWebhookBatch(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m1",
            from_me: false,
            type: "text",
            chat_id: "971500000001@s.whatsapp.net",
            timestamp: 1_790_000_010,
            text: { body: "changed" },
          },
        ],
        event: { type: "messages", event: "patch" },
      },
      "env-edit",
    );
    assert.equal(edited[0]?.action, "update");
    assert.match(edited[0]?.providerEventKey ?? "", /^whapi:message:m1:update:/);

    const removed = parseWhapiWebhookBatch(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m1",
            from_me: false,
            type: "text",
            chat_id: "971500000001@s.whatsapp.net",
            text: { body: "" },
          },
        ],
        event: { type: "messages", event: "delete" },
      },
      "env-delete",
    );
    assert.equal(removed[0]?.action, "delete");
    assert.equal(removed[0]?.providerEventKey, "whapi:message:m1:delete");

    const secondEdit = parseWhapiWebhookBatch(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m1",
            from_me: false,
            type: "text",
            chat_id: "971500000001@s.whatsapp.net",
            timestamp: 1_790_000_011,
            text: { body: "changed again" },
          },
        ],
        event: { type: "messages", event: "patch" },
      },
      "env-edit-2",
    );
    assert.notEqual(edited[0]?.providerEventKey, secondEdit[0]?.providerEventKey);

    const sameEdit = parseWhapiWebhookBatch(
      {
        channel_id: "chan-1",
        messages: [
          {
            id: "m1",
            from_me: false,
            type: "text",
            chat_id: "971500000001@s.whatsapp.net",
            timestamp: 1_790_000_010,
            text: { body: "changed" },
          },
        ],
        event: { type: "messages", event: "patch" },
      },
      "env-edit-retry",
    );
    assert.equal(edited[0]?.providerEventKey, sameEdit[0]?.providerEventKey);

    const statuses = parseWhapiWebhookBatch(
      {
        channel_id: "chan-1",
        statuses: [
          { id: "m1", status: "sent", timestamp: 1 },
          { id: "m1", status: "delivered", timestamp: 2 },
          { id: "m1", status: "read", timestamp: 3 },
        ],
        event: { type: "statuses", event: "post" },
      },
      "env-statuses",
    );
    assert.deepEqual(
      statuses.map((item) => item.providerEventKey),
      ["whapi:status:m1:sent", "whapi:status:m1:delivered", "whapi:status:m1:read"],
    );
  });

  it("does not use the login rate limit on the Whapi webhook", () => {
    const route = readFileSync(
      join(process.cwd(), "src/modules/whatsapp/routes/public/webhooks/whapi/route.ts"),
      "utf8",
    );
    assert.match(route, /whatsappWebhookRateLimit\(\)/);
    assert.doesNotMatch(route, /authRateLimit\(\)/);
  });
});

describe("outbound echo matching", () => {
  const older = new Date("2026-10-16T10:00:00.000Z");
  const newer = new Date("2026-10-16T10:01:00.000Z");

  it("attaches one pending row when its text is unique", () => {
    const chosen = choosePendingEchoCandidate(
      [
        { id: "b", textBody: "invoice", messageType: "TEXT", createdAt: newer },
        { id: "a", textBody: "other", messageType: "TEXT", createdAt: older },
      ],
      { textBody: "invoice" },
    );
    assert.equal(chosen?.id, "b");
  });

  it("does not guess when several pending rows have the same text", () => {
    const chosen = choosePendingEchoCandidate(
      [
        { id: "b", textBody: "invoice", messageType: "TEXT", createdAt: newer },
        { id: "a", textBody: "invoice", messageType: "TEXT", createdAt: older },
      ],
      { textBody: "invoice" },
    );
    assert.equal(chosen, null);
  });

  it("does not guess when the echo has no text", () => {
    const chosen = choosePendingEchoCandidate(
      [{ id: "a", textBody: null, messageType: "IMAGE", createdAt: older }],
      { textBody: null },
    );
    assert.equal(chosen, null);
  });
});

describe("conversation chronology", () => {
  const created = new Date("2026-10-16T09:00:00.000Z");

  it("keeps an older provider timestamp behind the current last message", () => {
    const newer = isNewerConversationMessage(
      { occurredAt: new Date("2026-10-16T08:00:00.000Z"), createdAt: created, id: "late" },
      { occurredAt: new Date("2026-10-16T12:00:00.000Z"), createdAt: created, id: "current" },
    );
    assert.equal(newer, false);
  });

  it("breaks equal provider timestamps by createdAt and then id", () => {
    const occurredAt = new Date("2026-10-16T12:00:00.000Z");
    const byCreated = isNewerConversationMessage(
      { occurredAt, createdAt: new Date("2026-10-16T12:00:02.000Z"), id: "a" },
      { occurredAt, createdAt: new Date("2026-10-16T12:00:01.000Z"), id: "b" },
    );
    assert.equal(byCreated, true);
    const byId = isNewerConversationMessage(
      { occurredAt, createdAt: created, id: "b" },
      { occurredAt, createdAt: created, id: "a" },
    );
    assert.equal(byId, true);
  });

  it("does not raise unread for an older row or for history", () => {
    const head = {
      occurredAt: new Date("2026-10-16T12:00:00.000Z"),
      createdAt: new Date("2026-10-16T12:00:01.000Z"),
      id: "head",
    };
    const receivedAt = new Date("2026-10-16T12:05:00.000Z");
    assert.equal(
      inboundCountsAsUnread({
        incoming: {
          occurredAt: new Date("2026-10-16T12:04:00.000Z"),
          createdAt: receivedAt,
          id: "live",
          receivedAt,
        },
        currentLast: head,
        lastReadAt: null,
      }),
      true,
    );
    assert.equal(
      inboundCountsAsUnread({
        incoming: {
          occurredAt: new Date("2026-10-16T11:00:00.000Z"),
          createdAt: receivedAt,
          id: "old",
          receivedAt,
        },
        currentLast: head,
        lastReadAt: null,
      }),
      false,
    );
    assert.equal(
      inboundCountsAsUnread({
        incoming: {
          occurredAt: new Date("2026-10-15T12:00:00.000Z"),
          createdAt: receivedAt,
          id: "history",
          receivedAt,
        },
        currentLast: null,
        lastReadAt: null,
      }),
      true,
    );
    assert.equal(
      inboundCountsAsUnread({
        incoming: {
          occurredAt: new Date("2026-10-15T12:00:00.000Z"),
          createdAt: receivedAt,
          id: "history-read",
          receivedAt,
        },
        currentLast: null,
        lastReadAt: new Date("2026-10-16T12:10:00.000Z"),
      }),
      false,
    );
    assert.equal(
      inboundCountsAsUnread({
        incoming: {
          occurredAt: null,
          createdAt: receivedAt,
          id: "undated",
          receivedAt,
        },
        currentLast: null,
        lastReadAt: new Date("2026-10-16T12:04:00.000Z"),
      }),
      false,
    );
  });

  it("keeps a failed batch item retryable without reopening a finished row", () => {
    assert.equal(webhookFailureDisposition(null), "insert");
    assert.equal(webhookFailureDisposition("RECEIVED"), "mark-failed");
    assert.equal(webhookFailureDisposition("FAILED"), "mark-failed");
    assert.equal(webhookFailureDisposition("PROCESSED"), "leave");
    assert.equal(webhookFailureDisposition("IGNORED"), "leave");
  });

  it("does not let a missing provider time replace a timed message", () => {
    const newer = isNewerConversationMessage(
      { occurredAt: null, createdAt: new Date("2026-10-16T18:00:00.000Z"), id: "now" },
      { occurredAt: new Date("2026-10-16T08:00:00.000Z"), createdAt: created, id: "timed" },
    );
    assert.equal(newer, false);
  });
});

describe("message revisions and realtime replay", () => {
  it("keeps delivery status monotonic", () => {
    assert.equal(nextProviderStatus("READ", "DELIVERED"), "READ");
    assert.equal(nextProviderStatus("DELIVERED", "READ"), "READ");
    assert.equal(nextProviderStatus("READ", "FAILED"), "READ");
  });

  it("records edit and revocation without dropping other payload fields", () => {
    const edited = mergeWhapiRevision({ source: "mobile" }, { editedAt: "2026-10-16T12:00:00.000Z" });
    assert.equal(readWhapiRevisionFlags(edited).edited, true);
    assert.equal(readWhapiRevisionFlags(edited).revoked, false);
    const revoked = mergeWhapiRevision(edited, { revokedAt: "2026-10-16T12:05:00.000Z" });
    assert.equal(readWhapiRevisionFlags(revoked).revoked, true);
    assert.equal((revoked as { source?: string }).source, "mobile");
  });

  it("asks the client to resync when replay is truncated or expired", () => {
    assert.equal(
      shouldResyncWhatsAppRealtime({ returnedCount: 101, limit: 100, afterId: 10, latestId: 400 }),
      true,
    );
    assert.equal(
      shouldResyncWhatsAppRealtime({ returnedCount: 0, limit: 100, afterId: 10, latestId: 400 }),
      true,
    );
    assert.equal(
      shouldResyncWhatsAppRealtime({ returnedCount: 3, limit: 100, afterId: 10, latestId: 13 }),
      false,
    );
  });
});
