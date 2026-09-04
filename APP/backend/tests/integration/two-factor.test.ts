import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { TOTP, Secret } from "otpauth";

/**
 * End-to-end two-factor authentication over real HTTP (app.inject) and a real
 * database. Only runs with RUN_INTEGRATION=true against a disposable test DB.
 *
 * Two things about the harness are load-bearing:
 *
 *  - `trustProxy` is on, so each test sends its own `x-forwarded-for`. The auth
 *    routes are rate limited 5/min PER IP, and a shared IP would make one test's
 *    attempts throttle the next test rather than exercise the code under test.
 *
 *  - A TOTP code identifies a 30s time-step, and the server honours each step at
 *    most once per user (replay protection). `freshCode` therefore never returns
 *    a step it has already handed out, waiting for the clock when it must.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test(
    "two-factor integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)",
    { skip: true },
    () => {},
  );
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  const run = Date.now().toString(36).toUpperCase();
  const EMAIL = `twofa-${run}@ex.test`;
  const PASSWORD = "two-factor-pass-1234";
  let userId = 0;

  /** Distinct rate-limit buckets: every test gets its own client IP. */
  let ipCounter = 0;
  const nextIp = () => `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  const from = (ip: string) => ({ "x-forwarded-for": ip });

  const PERIOD = 30;
  let secret = "";
  let lastStepIssued = -1;

  function totp(): TOTP {
    return new TOTP({
      issuer: "test",
      label: EMAIL,
      algorithm: "SHA1",
      digits: 6,
      period: PERIOD,
      secret: Secret.fromBase32(secret),
    });
  }

  /** A code for a step this suite has not used yet, inside the server's window. */
  async function freshCode(): Promise<string> {
    for (;;) {
      const current = Math.floor(Date.now() / 1000 / PERIOD);
      const step = Math.max(current, lastStepIssued + 1);
      if (step <= current + 1) {
        lastStepIssued = step;
        return totp().generate({ timestamp: step * PERIOD * 1000 });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const login = (ip: string, password = PASSWORD) =>
    app.inject({
      method: "POST",
      url: "/auth/login",
      headers: from(ip),
      payload: { email: EMAIL, password },
    });

  const bearer = (token: string, ip: string) => ({
    ...from(ip),
    authorization: `Bearer ${token}`,
  });

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;

    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");

    const user = await prisma.user.upsert({
      where: { email: normalizeEmail(EMAIL) },
      update: { status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) },
      create: {
        email: normalizeEmail(EMAIL),
        name: "Two Factor Test",
        status: "ACTIVE",
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    userId = user.id;
  });

  after(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    if (app) await app.close();
  });

  // --- TEST 1 ---------------------------------------------------------------
  test("without 2FA, email+password yields a full session immediately", async () => {
    const res = await login(nextIp());
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.requiresTwoFactor, false);
    assert.ok(data.accessToken);
    assert.ok(data.refreshToken);
  });

  // --- TEST 2 ---------------------------------------------------------------
  test("starting setup returns enrolment data but does NOT enable 2FA", async () => {
    const ip = nextIp();
    const session = (await login(ip)).json().data.accessToken as string;

    const started = await app.inject({
      method: "POST",
      url: "/auth/two-factor/setup",
      headers: bearer(session, ip),
      payload: { password: PASSWORD },
    });
    assert.equal(started.statusCode, 200);
    const setup = started.json().data;
    assert.ok(setup.otpauthUri.startsWith("otpauth://totp/"));
    assert.ok(setup.manualEntryKey.length >= 16);
    secret = setup.manualEntryKey;

    const status = await app.inject({
      method: "GET",
      url: "/auth/two-factor",
      headers: bearer(session, ip),
    });
    assert.equal(status.json().data.enabled, false);
    assert.equal(status.json().data.pendingSetup, true);

    // The account still authenticates in one step — a QR is not enrolment.
    assert.equal((await login(nextIp())).json().data.requiresTwoFactor, false);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorPendingSecretEncrypted: false },
    });
    assert.equal(row.twoFactorEnabled, false);
    // The pending secret is stored, but never in plaintext.
    assert.ok(row.twoFactorPendingSecretEncrypted);
    assert.equal(row.twoFactorPendingSecretEncrypted?.includes(secret), false);
  });

  // --- TEST 3 ---------------------------------------------------------------
  test("confirming setup with a wrong code leaves 2FA disabled", async () => {
    const ip = nextIp();
    const session = (await login(ip)).json().data.accessToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/setup/verify",
      headers: bearer(session, ip),
      payload: { code: "000000" },
    });
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.context.reason, "two_factor_invalid_code");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.twoFactorEnabled, false);
    assert.equal(await prisma.twoFactorRecoveryCode.count({ where: { userId } }), 0);
  });

  // --- TEST 4 ---------------------------------------------------------------
  let recoveryCodes: string[] = [];

  test("confirming setup with a valid code enables 2FA and issues recovery codes", async () => {
    const ip = nextIp();
    const session = (await login(ip)).json().data.accessToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/setup/verify",
      headers: bearer(session, ip),
      payload: { code: await freshCode() },
    });
    assert.equal(res.statusCode, 200);
    recoveryCodes = res.json().data.recoveryCodes;
    assert.equal(recoveryCodes.length, 10);
    assert.equal(new Set(recoveryCodes).size, 10);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorSecretEncrypted: false, twoFactorPendingSecretEncrypted: false },
    });
    assert.equal(row.twoFactorEnabled, true);
    assert.ok(row.twoFactorEnabledAt);
    // The pending slot is cleared and the live secret is ciphertext, not the key.
    assert.equal(row.twoFactorPendingSecretEncrypted, null);
    assert.equal(row.twoFactorSecretEncrypted?.includes(secret), false);

    // Only hashes are persisted — no raw code is recoverable from the database.
    const stored = await prisma.twoFactorRecoveryCode.findMany({
      where: { userId },
      omit: { codeHash: false },
    });
    assert.equal(stored.length, 10);
    for (const code of recoveryCodes) {
      assert.equal(
        stored.some((r) => r.codeHash === code),
        false,
      );
    }
  });

  // --- TEST 5 ---------------------------------------------------------------
  test("with 2FA on, login stops at a challenge and grants no session", async () => {
    const sessionsBefore = await prisma.authSession.count({ where: { userId } });

    const res = await login(nextIp());
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.requiresTwoFactor, true);
    assert.ok(data.challengeToken);
    assert.equal(data.accessToken, undefined);
    assert.equal(data.refreshToken, undefined);

    // Passing the password created no session — the challenge is not a login.
    assert.equal(await prisma.authSession.count({ where: { userId } }), sessionsBefore);
  });

  test("the challenge token is opaque and cannot reach a protected API", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;

    // Not a JWT: it has no header.payload.signature structure to verify.
    assert.equal(challengeToken.split(".").length, 1);

    for (const url of ["/auth/me", "/users", "/notifications"]) {
      const res = await app.inject({
        method: "GET",
        url,
        headers: bearer(challengeToken, ip),
      });
      assert.equal(res.statusCode, 401, `${url} must reject the challenge token`);
      assert.equal(res.json().error.code, "TOKEN_INVALID");
    }
  });

  // --- TEST 7 (before 6: a rejected code must not consume the challenge) ----
  test("a wrong authenticator code is denied", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/verify",
      headers: from(ip),
      payload: { challengeToken, code: "000000" },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.context.reason, "two_factor_invalid_code");
    assert.equal(res.json().data, undefined);
  });

  // --- TEST 6 ---------------------------------------------------------------
  test("a valid authenticator code completes the login", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;
    const code = await freshCode();

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/verify",
      headers: from(ip),
      payload: { challengeToken, code },
    });
    assert.equal(res.statusCode, 200);
    const tokens = res.json().data;
    assert.ok(tokens.accessToken);
    assert.ok(tokens.refreshToken);

    // The issued token is a real session token: it reaches a protected API.
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: bearer(tokens.accessToken, ip),
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().data.email, EMAIL.toLowerCase());
    assert.equal(me.json().data.twoFactorEnabled, true);

    // TEST 13a: the challenge is single-use — the same code cannot be replayed.
    const replay = await app.inject({
      method: "POST",
      url: "/auth/two-factor/verify",
      headers: from(nextIp()),
      payload: { challengeToken, code },
    });
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.json().error.context.reason, "two_factor_challenge_invalid");
  });

  test("a TOTP time-step cannot be replayed on a fresh challenge", async () => {
    const ip = nextIp();
    const used = totp().generate({ timestamp: lastStepIssued * PERIOD * 1000 });
    const challengeToken = (await login(ip)).json().data.challengeToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/verify",
      headers: from(ip),
      payload: { challengeToken, code: used },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.context.reason, "two_factor_invalid_code");
  });

  // --- TEST 8 + 9 -----------------------------------------------------------
  test("a recovery code logs in once and is then spent", async () => {
    const ip = nextIp();
    const code = recoveryCodes[0] as string;
    const challengeToken = (await login(ip)).json().data.challengeToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/recovery",
      headers: from(ip),
      payload: { challengeToken, recoveryCode: code },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().data.accessToken);
    assert.equal(res.json().data.recoveryCodesRemaining, 9);

    // TEST 9: the same code on a brand-new challenge is refused.
    const ip2 = nextIp();
    const second = (await login(ip2)).json().data.challengeToken as string;
    const reuse = await app.inject({
      method: "POST",
      url: "/auth/two-factor/recovery",
      headers: from(ip2),
      payload: { challengeToken: second, recoveryCode: code },
    });
    assert.equal(reuse.statusCode, 401);
    assert.equal(reuse.json().error.context.reason, "two_factor_invalid_code");
    assert.equal(await prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } }), 9);
  });

  test("recovery codes are accepted lowercase and without the separator", async () => {
    const ip = nextIp();
    const code = (recoveryCodes[1] as string).toLowerCase().replace("-", "");
    const challengeToken = (await login(ip)).json().data.challengeToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/recovery",
      headers: from(ip),
      payload: { challengeToken, recoveryCode: code },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.recoveryCodesRemaining, 8);
  });

  // --- TEST 13 --------------------------------------------------------------
  test("repeated wrong codes burn the challenge before the code space is searchable", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/two-factor/verify",
        headers: from(ip),
        payload: { challengeToken, code: "000000" },
      });
      assert.equal(res.statusCode, 401, `attempt ${attempt}`);
      assert.equal(res.json().error.context.reason, "two_factor_invalid_code");
    }

    const exhausted = await app.inject({
      method: "POST",
      url: "/auth/two-factor/verify",
      headers: from(ip),
      payload: { challengeToken, code: "000000" },
    });
    assert.equal(exhausted.statusCode, 429);
    assert.equal(exhausted.json().error.context.reason, "two_factor_too_many_attempts");

    // From a different IP (i.e. past the per-IP limiter) the challenge is dead,
    // proving the burn is server-side state and not just throttling.
    const dead = await app.inject({
      method: "POST",
      url: "/auth/two-factor/verify",
      headers: from(nextIp()),
      payload: { challengeToken, code: await freshCode() },
    });
    assert.equal(dead.statusCode, 401);
    assert.equal(dead.json().error.context.reason, "two_factor_challenge_invalid");
  });

  test("the per-IP rate limit throttles repeated login attempts", async () => {
    const ip = nextIp();
    let limited = false;
    for (let i = 0; i < 8; i += 1) {
      const res = await login(ip, "wrong-password");
      if (res.statusCode === 429) {
        assert.equal(res.json().error.code, "RATE_LIMITED");
        limited = true;
        break;
      }
    }
    assert.equal(limited, true, "expected the auth rate limit to engage");
  });

  // --- TEST 10 --------------------------------------------------------------
  test("regenerating recovery codes invalidates every previous code", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;
    const session = (
      await app.inject({
        method: "POST",
        url: "/auth/two-factor/verify",
        headers: from(ip),
        payload: { challengeToken, code: await freshCode() },
      })
    ).json().data.accessToken as string;

    const stale = recoveryCodes[5] as string;
    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/recovery-codes",
      headers: bearer(session, ip),
      payload: { password: PASSWORD, recoveryCode: recoveryCodes[4] },
    });
    assert.equal(res.statusCode, 200);
    const fresh: string[] = res.json().data.recoveryCodes;
    assert.equal(fresh.length, 10);
    assert.equal(fresh.some((c) => recoveryCodes.includes(c)), false);
    assert.equal(await prisma.twoFactorRecoveryCode.count({ where: { userId } }), 10);

    // An old code no longer authenticates...
    const ip2 = nextIp();
    const c2 = (await login(ip2)).json().data.challengeToken as string;
    const oldRes = await app.inject({
      method: "POST",
      url: "/auth/two-factor/recovery",
      headers: from(ip2),
      payload: { challengeToken: c2, recoveryCode: stale },
    });
    assert.equal(oldRes.statusCode, 401);

    // ...while a new one does.
    const ip3 = nextIp();
    const c3 = (await login(ip3)).json().data.challengeToken as string;
    const newRes = await app.inject({
      method: "POST",
      url: "/auth/two-factor/recovery",
      headers: from(ip3),
      payload: { challengeToken: c3, recoveryCode: fresh[0] },
    });
    assert.equal(newRes.statusCode, 200);
    recoveryCodes = fresh;
  });

  // --- Re-authentication guards --------------------------------------------
  test("disabling 2FA requires the password AND a second factor", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;
    const session = (
      await app.inject({
        method: "POST",
        url: "/auth/two-factor/verify",
        headers: from(ip),
        payload: { challengeToken, code: await freshCode() },
      })
    ).json().data.accessToken as string;

    const noSecondFactor = await app.inject({
      method: "POST",
      url: "/auth/two-factor/disable",
      headers: bearer(session, ip),
      payload: { password: PASSWORD },
    });
    assert.equal(noSecondFactor.statusCode, 422);
    assert.equal(
      noSecondFactor.json().error.context.reason,
      "two_factor_second_factor_required",
    );

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/auth/two-factor/disable",
      headers: bearer(session, ip),
      payload: { password: "not-the-password", recoveryCode: recoveryCodes[9] },
    });
    assert.equal(wrongPassword.statusCode, 422);
    assert.equal(
      wrongPassword.json().error.context.reason,
      "two_factor_password_invalid",
    );

    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorEnabled,
      true,
    );
  });

  // --- TEST 11 + 12 ---------------------------------------------------------
  test("2FA can be disabled with valid re-authentication, and login returns to one step", async () => {
    const ip = nextIp();
    const challengeToken = (await login(ip)).json().data.challengeToken as string;
    const session = (
      await app.inject({
        method: "POST",
        url: "/auth/two-factor/verify",
        headers: from(ip),
        payload: { challengeToken, code: await freshCode() },
      })
    ).json().data.accessToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/auth/two-factor/disable",
      headers: bearer(session, ip),
      payload: { password: PASSWORD, code: await freshCode() },
    });
    assert.equal(res.statusCode, 200);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorSecretEncrypted: false },
    });
    assert.equal(row.twoFactorEnabled, false);
    assert.equal(row.twoFactorSecretEncrypted, null);
    assert.equal(row.twoFactorEnabledAt, null);
    assert.equal(await prisma.twoFactorRecoveryCode.count({ where: { userId } }), 0);

    // TEST 12: back to a single-step login.
    const after = await login(nextIp());
    assert.equal(after.json().data.requiresTwoFactor, false);
    assert.ok(after.json().data.accessToken);
  });

  // --- Cancel + audit -------------------------------------------------------
  test("a cancelled setup leaves no pending state and does not enable 2FA", async () => {
    const ip = nextIp();
    const session = (await login(ip)).json().data.accessToken as string;

    await app.inject({
      method: "POST",
      url: "/auth/two-factor/setup",
      headers: bearer(session, ip),
      payload: { password: PASSWORD },
    });
    const cancelled = await app.inject({
      method: "POST",
      url: "/auth/two-factor/setup/cancel",
      headers: bearer(session, ip),
    });
    assert.equal(cancelled.statusCode, 200);

    const status = await app.inject({
      method: "GET",
      url: "/auth/two-factor",
      headers: bearer(session, ip),
    });
    assert.equal(status.json().data.enabled, false);
    assert.equal(status.json().data.pendingSetup, false);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorPendingSecretEncrypted: false },
    });
    assert.equal(row.twoFactorPendingSecretEncrypted, null);
  });

  test("the audit trail records the security events and holds no secrets", async () => {
    const entries = await prisma.auditLog.findMany({
      where: { action: { startsWith: "security.two_factor." } },
      orderBy: { createdAt: "asc" },
    });
    const actions = new Set(entries.map((e) => e.action));
    for (const expected of [
      "security.two_factor.setup_started",
      "security.two_factor.enabled",
      "security.two_factor.disabled",
      "security.two_factor.recovery_codes_regenerated",
      "security.two_factor.login_verified",
      "security.two_factor.recovery_code_used",
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }

    // No secret material may appear anywhere in the audit payloads.
    const serialized = JSON.stringify(entries);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes("otpauth://"), false);
    assert.equal(serialized.includes(PASSWORD), false);
    for (const code of recoveryCodes) {
      assert.equal(serialized.includes(code), false);
    }
  });
}
