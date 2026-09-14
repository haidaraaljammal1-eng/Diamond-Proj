import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppWebhookSecretsForTests } from "src/modules/whatsapp/whatsapp.config";
import { signMetaHubPayload } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import {
  FIXTURE_CHALLENGE,
  FIXTURE_DISPLAY_PHONE,
  FIXTURE_PHONE_NUMBER_ID,
  FIXTURE_PROFILE_NAME,
  FIXTURE_TEXT,
  FIXTURE_TIMESTAMP,
  FIXTURE_WA_ID,
  FIXTURE_WABA_ID,
  FIXTURE_WAMID,
  TEST_WEBHOOK_APP_SECRET,
  TEST_WEBHOOK_VERIFY_TOKEN,
  officialStatusPayload,
  officialTextMessagePayload,
  signedWebhook,
} from "../helpers/whatsapp-webhook-fixtures";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const OTHER_WABA = "199999999999999999";
const OTHER_PHONE = "1000000000000001";

function assertNoSecrets(payload: unknown, label: string) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  assert.equal(text.includes(TEST_WEBHOOK_APP_SECRET), false, `${label} leaked app secret`);
  assert.equal(text.includes(TEST_WEBHOOK_VERIFY_TOKEN), false, `${label} leaked verify token`);
  assert.equal(text.includes("test-wa-access-token-DO-NOT-LEAK"), false, `${label} leaked access token`);
  assert.equal(text.includes("enc:v1:"), false, `${label} leaked ciphertext`);
  assert.equal(text.includes("META_APP_SECRET"), false, `${label} leaked META_APP_SECRET`);
}

if (!RUN) {
  test("whatsapp webhook skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp webhook foundation", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let getIp = 10;

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp webhook tests require haidara_test");
      }
      setWhatsAppWebhookSecretsForTests({
        appSecret: TEST_WEBHOOK_APP_SECRET,
        verifyToken: TEST_WEBHOOK_VERIFY_TOKEN,
      });
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
    });

    after(async () => {
      setWhatsAppWebhookSecretsForTests(undefined);
      await app.close();
    });

    async function resetState() {
      await resetWhatsAppTables(prisma);
    }

    async function seedConnection(input?: {
      wabaId?: string;
      phoneNumberId?: string;
      status?: "LINKED" | "DISCONNECTED";
      webhookStatus?: "NOT_CONFIGURED" | "PENDING" | "ACTIVE" | "ERROR";
    }) {
      return prisma.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: input?.status ?? "LINKED",
          wabaId: input?.wabaId ?? FIXTURE_WABA_ID,
          phoneNumberId: input?.phoneNumberId ?? FIXTURE_PHONE_NUMBER_ID,
          displayPhoneNumber: FIXTURE_DISPLAY_PHONE,
          verifiedName: "Test Business",
          credentialCiphertext: encryptWhatsAppCredential("test-wa-access-token-DO-NOT-LEAK"),
          connectedAt: new Date(),
          webhookStatus: input?.webhookStatus ?? "PENDING",
          ...(input?.status === "DISCONNECTED" ? { disconnectedAt: new Date() } : {}),
        },
      });
    }

    async function postWebhook(
      payload: unknown,
      opts?: { signature?: string | null; raw?: Buffer; ip?: string },
    ) {
      const raw = opts?.raw ?? Buffer.from(JSON.stringify(payload), "utf8");
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (opts?.signature !== null) {
        headers["x-hub-signature-256"] =
          opts?.signature ?? signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET);
      }
      if (opts?.ip) headers["x-forwarded-for"] = opts.ip;
      return app.inject({
        method: "POST",
        url: "/whatsapp/webhooks/meta",
        headers,
        payload: raw,
      });
    }

    async function verifyGet(query: string) {
      getIp += 1;
      return app.inject({
        method: "GET",
        url: `/whatsapp/webhooks/meta?${query}`,
        headers: { "x-forwarded-for": `203.0.113.${getIp}` },
      });
    }

    async function domainCounts() {
      const [customers, contracts, vehicles, ledger, events] = await Promise.all([
        prisma.customer.count(),
        prisma.contract.count(),
        prisma.vehicle.count(),
        prisma.financialLedgerEntry.count(),
        prisma.whatsAppWebhookEvent.count(),
      ]);
      return { customers, contracts, vehicles, ledger, events };
    }

    test("GET verification succeeds with the correct verify token", async () => {
      const res = await verifyGet(
        `hub.mode=subscribe&hub.verify_token=${TEST_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${FIXTURE_CHALLENGE}`,
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body, FIXTURE_CHALLENGE);
      assert.equal(res.headers["content-type"]?.includes("text/plain"), true);
      assertNoSecrets(res.body, "get-verify-ok");
    });

    test("GET verification rejects an incorrect verify token", async () => {
      const res = await verifyGet(
        `hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=${FIXTURE_CHALLENGE}`,
      );
      assert.equal(res.statusCode, 403);
      assert.notEqual(res.body, FIXTURE_CHALLENGE);
      const json = res.json();
      assert.equal(json.error.code, WhatsAppErrorReason.WEBHOOK_VERIFY_FAILED);
      assert.equal("message" in (json.error ?? {}), false);
      assertNoSecrets(res.body, "get-verify-fail");
    });

    test("verify token is absent from responses and audit logs", async () => {
      await verifyGet(
        `hub.mode=subscribe&hub.verify_token=${TEST_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${FIXTURE_CHALLENGE}`,
      );
      const logs = await prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 60_000) } },
        take: 50,
      });
      for (const row of logs) {
        assertNoSecrets(
          { action: row.action, metadata: row.metadata, before: row.before, after: row.after },
          `audit:${row.action}`,
        );
      }
    });

    test("valid POST signature is accepted and routes to the known connection", async () => {
      await resetState();
      const connection = await seedConnection();
      const before = await domainCounts();
      const payload = officialTextMessagePayload();
      const res = await postWebhook(payload);
      assert.equal(res.statusCode, 200);
      assertNoSecrets(res.body, "post-ok");

      const event = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: `wamid:${FIXTURE_WAMID}` },
      });
      assert.ok(event);
      assert.equal(event!.connectionId, connection.id);
      assert.equal(event!.eventType, "MESSAGE_RECEIVED");
      assert.equal(event!.status, "PROCESSED");
      assert.equal(event!.customerWaId, FIXTURE_WA_ID);
      assert.equal(event!.customerDisplayName, FIXTURE_PROFILE_NAME);
      assert.equal(event!.textBody, FIXTURE_TEXT);
      assert.equal(event!.messageType, "text");
      assert.equal(event!.occurredAt?.getTime(), Number(FIXTURE_TIMESTAMP) * 1000);
      assert.notEqual(event!.receivedAt.getTime(), event!.occurredAt?.getTime());
      assert.equal(event!.wabaId, FIXTURE_WABA_ID);
      assert.equal(event!.phoneNumberId, FIXTURE_PHONE_NUMBER_ID);

      const updated = await prisma.whatsAppConnection.findUnique({ where: { id: connection.id } });
      assert.equal(updated!.webhookStatus, "ACTIVE");
      assert.ok(updated!.lastWebhookAt);

      const after = await domainCounts();
      assert.equal(after.customers, before.customers);
      assert.equal(after.contracts, before.contracts);
      assert.equal(after.vehicles, before.vehicles);
      assert.equal(after.ledger, before.ledger);
      assert.equal(after.events, before.events + 1);
    });

    test("invalid and missing signatures are rejected before any write", async () => {
      await resetState();
      await seedConnection();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.unsigned" });
      const missing = await postWebhook(payload, { signature: null });
      assert.equal(missing.statusCode, 403);
      assert.equal(missing.json().error.code, WhatsAppErrorReason.WEBHOOK_INVALID_SIGNATURE);

      const invalid = await postWebhook(payload, { signature: "sha256=deadbeef" });
      assert.equal(invalid.statusCode, 403);

      const signed = signedWebhook(payload);
      const modified = Buffer.from(signed.raw.toString("utf8").replace("unsigned", "tampered"));
      const tampered = await postWebhook(payload, { raw: modified, signature: signed.signature });
      assert.equal(tampered.statusCode, 403);

      assert.equal(await prisma.whatsAppWebhookEvent.count(), 0);
      assertNoSecrets(missing.body, "missing-sig");
      assertNoSecrets(invalid.body, "invalid-sig");
    });

    test("raw-body signature verification accepts exact bytes and rejects stringify rebuilds", async () => {
      await resetState();
      await seedConnection();
      const pretty = Buffer.from(
        '{ "object" : "whatsapp_business_account", "entry": [] }',
        "utf8",
      );
      const ok = await postWebhook({}, { raw: pretty, signature: signMetaHubPayload(pretty, TEST_WEBHOOK_APP_SECRET) });
      assert.equal(ok.statusCode, 200);

      const rebuilt = Buffer.from(JSON.stringify(JSON.parse(pretty.toString("utf8"))), "utf8");
      const rejected = await postWebhook(
        {},
        { raw: rebuilt, signature: signMetaHubPayload(pretty, TEST_WEBHOOK_APP_SECRET) },
      );
      assert.equal(rejected.statusCode, 403);
    });

    test("unknown WABA or phoneNumberId cannot attach to the active connection", async () => {
      await resetState();
      const known = await seedConnection();
      const payload = officialTextMessagePayload({
        wabaId: OTHER_WABA,
        phoneNumberId: OTHER_PHONE,
        wamid: "wamid.test.synthetic.unknown",
      });
      const res = await postWebhook(payload);
      assert.equal(res.statusCode, 200);
      const event = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.unknown" },
      });
      assert.equal(event!.connectionId, null);
      assert.equal(event!.status, "IGNORED");
      assert.equal(event!.failureCode, WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND);
      const still = await prisma.whatsAppConnection.findUnique({ where: { id: known.id } });
      assert.equal(still!.webhookStatus, "PENDING");
      assertNoSecrets(res.body, "unknown-connection");
    });

    test("duplicate webhook does not duplicate the event row", async () => {
      await resetState();
      await seedConnection();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.dup" });
      const first = await postWebhook(payload);
      const second = await postWebhook(payload);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.equal(
        await prisma.whatsAppWebhookEvent.count({
          where: { providerEventKey: "wamid:wamid.test.synthetic.dup" },
        }),
        1,
      );
    });

    test("concurrent duplicate requests remain idempotent", async () => {
      await resetState();
      await seedConnection();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.race" });
      const results = await Promise.all([postWebhook(payload), postWebhook(payload), postWebhook(payload)]);
      assert.equal(results.every((r) => r.statusCode === 200), true);
      assert.equal(
        await prisma.whatsAppWebhookEvent.count({
          where: { providerEventKey: "wamid:wamid.test.synthetic.race" },
        }),
        1,
      );
    });

    test("malformed JSON fails safely without a write", async () => {
      await resetState();
      await seedConnection();
      const raw = Buffer.from("{not-json", "utf8");
      const res = await postWebhook({}, { raw, signature: signMetaHubPayload(raw, TEST_WEBHOOK_APP_SECRET) });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD);
      assert.equal(await prisma.whatsAppWebhookEvent.count(), 0);
      assertNoSecrets(res.body, "malformed");
    });

    test("unknown fields are tolerated and unsupported types do not crash", async () => {
      await resetState();
      const connection = await seedConnection();
      const payload = officialTextMessagePayload({
        wamid: "wamid.test.synthetic.image",
        type: "image",
        extraValueFields: { future_flag: true },
      });
      const res = await postWebhook(payload);
      assert.equal(res.statusCode, 200);
      const event = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.image" },
      });
      assert.equal(event!.connectionId, connection.id);
      assert.equal(event!.messageType, "image");
      assert.equal(event!.textBody, null);
      assert.equal(event!.eventType, "MESSAGE_RECEIVED");
    });

    test("malformed timestamp is stored without substituting server time", async () => {
      await resetState();
      await seedConnection();
      const payload = officialTextMessagePayload({
        wamid: "wamid.test.synthetic.badts",
        timestamp: "not-a-unix",
      });
      const res = await postWebhook(payload);
      assert.equal(res.statusCode, 200);
      const event = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.badts" },
      });
      assert.equal(event!.occurredAt, null);
      assert.ok(event!.receivedAt);
    });

    test("customer message body is absent from AuditLog", async () => {
      await resetState();
      await seedConnection();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.audit" }));
      const logs = await prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 30_000) } },
        take: 80,
      });
      for (const row of logs) {
        const blob = JSON.stringify({
          action: row.action,
          metadata: row.metadata,
          before: row.before,
          after: row.after,
        });
        assert.equal(blob.includes(FIXTURE_TEXT), false, `audit leaked message: ${row.action}`);
        assert.equal(row.action.includes("/whatsapp/webhooks/meta"), false);
      }
    });

    test("provider credentials are stripped before webhook persistence", async () => {
      await resetState();
      await seedConnection();
      const payload = officialTextMessagePayload({ wamid: "wamid.test.synthetic.secret" });
      (payload as { access_token?: string }).access_token = "test-wa-access-token-DO-NOT-LEAK";
      const res = await postWebhook(payload);
      assert.equal(res.statusCode, 200);
      const event = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.secret" },
      });
      const blob = JSON.stringify(event);
      assert.equal(blob.includes("test-wa-access-token-DO-NOT-LEAK"), false);
      assert.equal(blob.includes(TEST_WEBHOOK_APP_SECRET), false);
    });

    test("a disconnected connection is not revived by webhook delivery", async () => {
      await resetState();
      const retired = await seedConnection({ status: "DISCONNECTED", webhookStatus: "NOT_CONFIGURED" });
      const live = await seedConnection({
        wabaId: OTHER_WABA,
        phoneNumberId: OTHER_PHONE,
        webhookStatus: "PENDING",
      });
      const res = await postWebhook(
        officialTextMessagePayload({ wamid: "wamid.test.synthetic.retired" }),
      );
      assert.equal(res.statusCode, 200);
      const event = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.retired" },
      });
      assert.equal(event!.connectionId, null);
      const retiredAfter = await prisma.whatsAppConnection.findUnique({ where: { id: retired.id } });
      assert.equal(retiredAfter!.status, "DISCONNECTED");
      assert.equal(retiredAfter!.webhookStatus, "NOT_CONFIGURED");
      const liveAfter = await prisma.whatsAppConnection.findUnique({ where: { id: live.id } });
      assert.equal(liveAfter!.webhookStatus, "PENDING");
    });

    test("replaced connection B receives B events; history stays on A", async () => {
      await resetState();
      const a = await seedConnection({ webhookStatus: "PENDING" });
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.hist-a" }));
      await prisma.whatsAppConnection.update({
        where: { id: a.id },
        data: { status: "DISCONNECTED", webhookStatus: "NOT_CONFIGURED", disconnectedAt: new Date() },
      });
      const b = await seedConnection({
        wabaId: OTHER_WABA,
        phoneNumberId: OTHER_PHONE,
        webhookStatus: "PENDING",
      });
      await postWebhook(
        officialTextMessagePayload({
          wabaId: OTHER_WABA,
          phoneNumberId: OTHER_PHONE,
          wamid: "wamid.test.synthetic.hist-b",
        }),
      );
      const histA = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.hist-a" },
      });
      const histB = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: "wamid:wamid.test.synthetic.hist-b" },
      });
      assert.equal(histA!.connectionId, a.id);
      assert.equal(histB!.connectionId, b.id);
      const aAfter = await prisma.whatsAppConnection.findUnique({ where: { id: a.id } });
      assert.equal(aAfter!.status, "DISCONNECTED");
    });

    test("message status events persist without a message table", async () => {
      await resetState();
      const connection = await seedConnection();
      const res = await postWebhook(officialStatusPayload());
      assert.equal(res.statusCode, 200);
      const event = await prisma.whatsAppWebhookEvent.findFirst({
        where: { eventType: "MESSAGE_STATUS", connectionId: connection.id },
      });
      assert.ok(event);
      assert.equal(event!.messageType, "delivered");
      assert.equal(event!.textBody, null);
    });

    test("webhook arrival does not mutate contracts, vehicles, or finance", async () => {
      await resetState();
      await seedConnection();
      const before = await domainCounts();
      await postWebhook(officialTextMessagePayload({ wamid: "wamid.test.synthetic.sidefx" }));
      const after = await domainCounts();
      assert.equal(after.customers, before.customers);
      assert.equal(after.contracts, before.contracts);
      assert.equal(after.vehicles, before.vehicles);
      assert.equal(after.ledger, before.ledger);
    });
  });
}
