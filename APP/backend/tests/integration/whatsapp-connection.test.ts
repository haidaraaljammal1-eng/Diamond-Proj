import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import {
  createFakeWhatsAppProvider,
  TEST_DISPLAY_PHONE,
  TEST_PHONE_NUMBER_ID,
  TEST_WABA_ID,
  TEST_WHATSAPP_TOKEN,
  testWhatsAppGrant,
} from "../helpers/fake-whatsapp-provider";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { isWhatsAppMetaConfigured } from "src/modules/whatsapp/whatsapp.config";
import { PERMISSIONS } from "src/constants/permissions";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

function reason(body: string): string | undefined {
  try {
    return JSON.parse(body)?.error?.context?.reason as string | undefined;
  } catch {
    return undefined;
  }
}

function assertNoSecrets(payload: unknown, label: string) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  assert.equal(text.includes(TEST_WHATSAPP_TOKEN), false, `${label} leaked test token`);
  assert.equal(text.includes("credentialCiphertext"), false, `${label} leaked ciphertext field`);
  assert.equal(text.includes("enc:v1:"), false, `${label} leaked ciphertext prefix`);
  assert.equal(text.includes("META_APP_SECRET"), false, `${label} leaked app secret name as value`);
  assert.equal(/"accessToken"\s*:/.test(text), false, `${label} leaked accessToken field`);
  assert.equal(/"authorizationCode"\s*:\s*"[^"]+"/.test(text) && label.includes("audit"), false);
}

if (!RUN) {
  test("whatsapp connection skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("whatsapp connection foundation", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const manager = {
      email: `wa-mgr-${run}@example.test`,
      password: "wa-manager-pass-123",
    };
    const stranger = {
      email: `wa-str-${run}@example.test`,
      password: "wa-stranger-pass-123",
    };
    const other = {
      email: `wa-oth-${run}@example.test`,
      password: "wa-other-pass-123",
    };
    let managerToken = "";
    let strangerToken = "";
    let otherToken = "";
    let fake: ReturnType<typeof createFakeWhatsAppProvider>;

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("whatsapp connection tests require haidara_test");
      }
      fake = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests(fake.provider);
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      await seedPaymentUser(
        prisma,
        manager.email,
        manager.password,
        `wa_mgr_${run}`,
        [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
      );
      await seedPaymentUser(
        prisma,
        stranger.email,
        stranger.password,
        `wa_str_${run}`,
        ["vehicles.read"],
      );
      await seedPaymentUser(
        prisma,
        other.email,
        other.password,
        `wa_oth_${run}`,
        [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
      );
      managerToken = await login(app, manager);
      strangerToken = await login(app, stranger);
      otherToken = await login(app, other);
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      await app.close();
    });

    async function startAttempt(token = managerToken) {
      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/attempts",
        headers: auth(token),
      });
      return res;
    }

    async function authorizeAttempt(
      attemptId: string,
      payload: { authorizationCode: string; state: string },
      token = managerToken,
    ) {
      return app.inject({
        method: "POST",
        url: `/whatsapp/connection/attempts/${attemptId}/authorize`,
        headers: auth(token),
        payload,
      });
    }

    async function selectAttempt(
      attemptId: string,
      payload: { wabaId: string; phoneNumberId: string },
      token = managerToken,
    ) {
      return app.inject({
        method: "POST",
        url: `/whatsapp/connection/attempts/${attemptId}/select`,
        headers: auth(token),
        payload,
      });
    }

    async function getConnection(token = managerToken) {
      return app.inject({
        method: "GET",
        url: "/whatsapp/connection",
        headers: auth(token),
      });
    }

    async function linkOffice(token = managerToken) {
      const started = await startAttempt(token);
      assert.equal(started.statusCode, 200, started.body);
      assertNoSecrets(started.body, "start");
      const { attemptId, state } = started.json().data as {
        attemptId: string;
        state: string;
      };
      const authorized = await authorizeAttempt(attemptId, {
        authorizationCode: "ok-code",
        state,
      }, token);
      assert.equal(authorized.statusCode, 200, authorized.body);
      assertNoSecrets(authorized.body, "authorize");
      const selected = await selectAttempt(
        attemptId,
        { wabaId: TEST_WABA_ID, phoneNumberId: TEST_PHONE_NUMBER_ID },
        token,
      );
      assert.equal(selected.statusCode, 200, selected.body);
      assertNoSecrets(selected.body, "select");
      return selected.json().data;
    }

    test("manage permission is required and appears on /auth/me", async () => {
      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: auth(managerToken),
      });
      assert.equal(me.statusCode, 200, me.body);
      const permissions = me.json().data.permissions as string[];
      assert.equal(permissions.includes(PERMISSIONS.WHATSAPP_MANAGE_CONNECTION), true);

      const sys = await prisma.role.findUnique({
        where: { key: "system_admin" },
        include: { permissions: { include: { permission: true } } },
      });
      if (sys) {
        assert.equal(
          sys.permissions.some((rp) => rp.permission.key === PERMISSIONS.WHATSAPP_MANAGE_CONNECTION),
          true,
          "system_admin must receive catalog permission whatsapp.manage_connection",
        );
      }
    });

    test("non-authorized employee cannot initiate linking, read, or disconnect", async () => {
      const started = await startAttempt(strangerToken);
      assert.equal(started.statusCode, 403);

      const read = await getConnection(strangerToken);
      assert.equal(read.statusCode, 403);

      const disconnect = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/disconnect",
        headers: auth(strangerToken),
      });
      assert.equal(disconnect.statusCode, 403);
    });

    test("GET sanitized connection never leaks secrets and is DISCONNECTED before link", async () => {
      const res = await getConnection();
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.status, "DISCONNECTED");
      assertNoSecrets(res.body, "get-empty");
    });

    test("connection attempt belongs to the initiating user", async () => {
      const started = await startAttempt(managerToken);
      assert.equal(started.statusCode, 200, started.body);
      const { attemptId, state } = started.json().data;
      const stolen = await authorizeAttempt(
        attemptId,
        { authorizationCode: "ok-code", state },
        otherToken,
      );
      assert.equal(stolen.statusCode, 404);
      assert.equal(reason(stolen.body), "WHATSAPP_CONNECTION_ATTEMPT_NOT_FOUND");
    });

    test("expired attempt is rejected", async () => {
      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      await prisma.whatsAppConnectionAttempt.update({
        where: { id: attemptId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await authorizeAttempt(attemptId, { authorizationCode: "ok-code", state });
      assert.equal(res.statusCode, 409);
      assert.equal(reason(res.body), "WHATSAPP_CONNECTION_ATTEMPT_EXPIRED");
    });

    test("used attempt cannot replay authorize", async () => {
      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      const first = await authorizeAttempt(attemptId, { authorizationCode: "ok-code", state });
      assert.equal(first.statusCode, 200, first.body);
      const replay = await authorizeAttempt(attemptId, { authorizationCode: "ok-code", state });
      assert.equal(replay.statusCode, 409);
      assert.equal(reason(replay.body), "WHATSAPP_CONNECTION_ATTEMPT_USED");
    });

    test("arbitrary WABA and phone ids are rejected; selection must be in the grant", async () => {
      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      const authorized = await authorizeAttempt(attemptId, {
        authorizationCode: "ok-code",
        state,
      });
      assert.equal(authorized.statusCode, 200, authorized.body);
      const badWaba = await selectAttempt(attemptId, {
        wabaId: "999999",
        phoneNumberId: TEST_PHONE_NUMBER_ID,
      });
      assert.equal(badWaba.statusCode, 409);
      assert.equal(reason(badWaba.body), "WHATSAPP_WABA_NOT_GRANTED");

      const badPhone = await selectAttempt(attemptId, {
        wabaId: TEST_WABA_ID,
        phoneNumberId: "000000",
      });
      assert.equal(badPhone.statusCode, 409);
      assert.equal(reason(badPhone.body), "WHATSAPP_PHONE_NOT_GRANTED");
    });

    test("successful link stores encrypted credential and never returns the token", async () => {
      const data = await linkOffice();
      assert.equal(data.status, "LINKED");
      assert.equal(data.displayPhoneNumber, TEST_DISPLAY_PHONE);
      assert.equal(data.verifiedName, "Test Business");
      assert.equal(data.webhookActive, undefined);
      assert.equal(data.messagingReady, undefined);

      const current = await prisma.whatsAppConnection.findFirst({
        where: { status: "LINKED" },
      });
      assert.ok(current);
      assert.equal(current!.credentialCiphertext?.startsWith("enc:v1:"), true);
      assert.equal(current!.credentialCiphertext?.includes(TEST_WHATSAPP_TOKEN), false);

      const got = await getConnection();
      assert.equal(got.json().data.status, "LINKED");
      assertNoSecrets(got.body, "get-linked");
    });

    test("audit payloads never contain the provider token", async () => {
      const logs = await prisma.auditLog.findMany({
        where: { action: { startsWith: "WHATSAPP_" } },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      assert.ok(logs.length > 0);
      for (const row of logs) {
        assertNoSecrets(
          { action: row.action, metadata: row.metadata, before: row.before, after: row.after },
          `audit:${row.action}`,
        );
      }
    });

    test("invalid provider response fails closed", async () => {
      fake.setInvalidResponse(true);
      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      const res = await authorizeAttempt(attemptId, { authorizationCode: "ok-code", state });
      fake.setInvalidResponse(false);
      assert.equal(res.statusCode, 409);
      assert.equal(reason(res.body), "WHATSAPP_CONNECTION_VALIDATION_FAILED");
      assertNoSecrets(res.body, "invalid-provider");
    });

    test("failed replacement preserves the current LINKED connection", async () => {
      const before = await getConnection();
      assert.equal(before.json().data.status, "LINKED");
      const phone = before.json().data.displayPhoneNumber;

      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      const authorized = await authorizeAttempt(attemptId, {
        authorizationCode: "ok-code",
        state,
      });
      assert.equal(authorized.statusCode, 200, authorized.body);
      const failed = await selectAttempt(attemptId, {
        wabaId: "999999",
        phoneNumberId: TEST_PHONE_NUMBER_ID,
      });
      assert.equal(failed.statusCode, 409);

      const afterFail = await getConnection();
      assert.equal(afterFail.json().data.status, "LINKED");
      assert.equal(afterFail.json().data.displayPhoneNumber, phone);
      const active = await prisma.whatsAppConnection.count({ where: { status: "LINKED" } });
      assert.equal(active, 1);
    });

    test("successful replacement atomically replaces the previous active connection", async () => {
      fake.setGrant(
        testWhatsAppGrant({
          phones: [
            {
              wabaId: TEST_WABA_ID,
              phoneNumberId: TEST_PHONE_NUMBER_ID,
              displayPhoneNumber: TEST_DISPLAY_PHONE,
              verifiedName: "Test Business",
            },
            {
              wabaId: TEST_WABA_ID,
              phoneNumberId: "1002",
              displayPhoneNumber: "971500000001",
              verifiedName: "Test Business",
            },
          ],
        }),
      );
      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      const authorized = await authorizeAttempt(attemptId, {
        authorizationCode: "ok-code",
        state,
      });
      assert.equal(authorized.statusCode, 200, authorized.body);
      const selected = await selectAttempt(attemptId, {
        wabaId: TEST_WABA_ID,
        phoneNumberId: "1002",
      });
      assert.equal(selected.statusCode, 200, selected.body);
      assert.equal(selected.json().data.displayPhoneNumber, "971500000001");
      assert.equal(selected.json().data.status, "LINKED");
      const active = await prisma.whatsAppConnection.findMany({
        where: { status: { in: ["LINKED", "LINKING", "REAUTH_REQUIRED", "ERROR"] } },
      });
      assert.equal(active.length, 1);
      assert.equal(active[0]?.phoneNumberId, "1002");
      fake.setGrant(testWhatsAppGrant());
    });

    test("concurrent selects cannot produce two active connections", async () => {
      const started = await startAttempt();
      const { attemptId, state } = started.json().data;
      const authorized = await authorizeAttempt(attemptId, {
        authorizationCode: "ok-code",
        state,
      });
      assert.equal(authorized.statusCode, 200, authorized.body);
      const payload = { wabaId: TEST_WABA_ID, phoneNumberId: TEST_PHONE_NUMBER_ID };
      const [a, b] = await Promise.all([
        selectAttempt(attemptId, payload),
        selectAttempt(attemptId, payload),
      ]);
      const codes = [a.statusCode, b.statusCode].sort();
      assert.equal(codes.includes(200), true);
      assert.equal(codes.includes(409) || codes.includes(404), true);
      const active = await prisma.whatsAppConnection.count({
        where: { status: { in: ["LINKED", "LINKING", "REAUTH_REQUIRED", "ERROR"] } },
      });
      assert.equal(active, 1);
    });

    test("disconnect requires manage permission and never returns a credential", async () => {
      const denied = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/disconnect",
        headers: auth(strangerToken),
      });
      assert.equal(denied.statusCode, 403);

      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/disconnect",
        headers: auth(managerToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.status, "DISCONNECTED");
      assertNoSecrets(res.body, "disconnect");
      const row = await prisma.whatsAppConnection.findFirst({
        orderBy: { disconnectedAt: "desc" },
      });
      assert.equal(row?.credentialCiphertext, null);
      const got = await getConnection();
      assert.equal(got.json().data.status, "DISCONNECTED");
    });
  });

  describe("whatsapp provider not configured", { concurrency: false }, () => {
    let app: FastifyInstance;

    before(async () => {
      setWhatsAppProviderForTests(undefined);
      const { buildApp } = await import("src/app");
      app = await buildApp();
    });

    after(async () => {
      await app.close();
    });

    test("missing Meta config returns WHATSAPP_PROVIDER_NOT_CONFIGURED", async (t) => {
      if (isWhatsAppMetaConfigured()) {
        t.skip("META_APP_ID/SECRET are set in this environment");
        return;
      }
      const prisma = app.prisma;
      const run = `u${Date.now().toString(36)}`;
      await seedPaymentUser(
        prisma,
        `wa-unconf-${run}@example.test`,
        "wa-unconf-pass-123",
        `wa_unconf_${run}`,
        [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
      );
      const token = await login(app, {
        email: `wa-unconf-${run}@example.test`,
        password: "wa-unconf-pass-123",
      });
      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/connection/attempts",
        headers: auth(token),
      });
      assert.equal(res.statusCode, 409, res.body);
      assert.equal(reason(res.body), "WHATSAPP_PROVIDER_NOT_CONFIGURED");
      assert.equal(res.body.includes("LINKED"), false);
    });
  });
}
