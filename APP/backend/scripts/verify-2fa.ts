/**
 * Runtime verification of the 2FA feature against the LIVE server on :4000.
 * Real HTTP, real database, real TOTP codes from `otpauth`.
 *
 * Covers the 14 required runtime tests (TEST 14 is the browser pass).
 * Each request carries its own X-Forwarded-For so the per-IP auth rate limit
 * isolates cases instead of one case throttling the next (the app sets
 * trustProxy, so the header is what the limiter keys on).
 *
 * Run from the backend repo root:  npx tsx <this file>
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { TOTP, Secret } from "otpauth";
import { env } from "src/config/env";
import { hashPassword } from "src/lib/security/password";

const BASE = "http://localhost:4000";
const EMAIL = `rt-2fa-${Date.now().toString(36)}@ex.test`;
const PASSWORD = "runtime-2fa-pass-1234";
const PERIOD = 30;

// Mirrors the app's client, including the global omit — so a field this script
// can read only via an explicit override is a field the API cannot leak.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  omit: {
    user: {
      passwordHash: true,
      twoFactorSecretEncrypted: true,
      twoFactorPendingSecretEncrypted: true,
    },
    authSession: { refreshTokenHash: true },
    securityToken: { tokenHash: true },
    twoFactorRecoveryCode: { codeHash: true },
  },
});

let ipCounter = 0;
const nextIp = () => `172.31.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

let passed = 0;
let failed = 0;
const results: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    results.push(`  PASS  ${label}`);
  } else {
    failed += 1;
    results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(
  path: string,
  init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": init.ip ?? nextIp(),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json, raw: text };
}

const login = (ip = nextIp(), password = PASSWORD) =>
  call("/auth/login", { method: "POST", body: { email: EMAIL, password }, ip });

let secret = "";
let lastStepIssued = -1;

function totp() {
  return new TOTP({
    issuer: "runtime",
    label: EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

/** A code for a step not yet handed out, inside the server's ±1 window. */
async function freshCode(): Promise<string> {
  for (;;) {
    const current = Math.floor(Date.now() / 1000 / PERIOD);
    const step = Math.max(current, lastStepIssued + 1);
    if (step <= current + 1) {
      lastStepIssued = step;
      return totp().generate({ timestamp: step * PERIOD * 1000 });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  console.log(`\nRuntime 2FA verification against ${BASE}`);
  console.log(`Test account: ${EMAIL}\n`);

  await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Runtime 2FA",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
    },
  });

  // TEST 1 — no 2FA: straight in.
  const t1 = await login();
  check(
    "TEST 1  no 2FA → login issues a full session",
    t1.status === 200 && t1.body?.data?.requiresTwoFactor === false && !!t1.body?.data?.accessToken,
    `status=${t1.status}`,
  );
  let session: string = t1.body?.data?.accessToken;

  // TEST 2 — setup starts, but 2FA is NOT on.
  const start = await call("/auth/two-factor/setup", {
    method: "POST",
    body: { password: PASSWORD },
    token: session,
  });
  secret = start.body?.data?.manualEntryKey ?? "";
  const uri: string = start.body?.data?.otpauthUri ?? "";
  check(
    "TEST 2  setup returns QR URI + manual key",
    start.status === 200 && uri.startsWith("otpauth://totp/") && secret.length >= 16,
    `status=${start.status}`,
  );

  const afterStart = await prisma.user.findUniqueOrThrow({
    where: { email: EMAIL },
    omit: { twoFactorPendingSecretEncrypted: false },
  });
  check(
    "TEST 2  a generated QR does NOT enable 2FA (still pending)",
    afterStart.twoFactorEnabled === false && !!afterStart.twoFactorPendingSecretEncrypted,
  );
  check(
    "TEST 2  the pending secret is stored encrypted, never in plaintext",
    !afterStart.twoFactorPendingSecretEncrypted?.includes(secret),
  );
  const stillOneStep = await login();
  check(
    "TEST 2  login is still one-step while setup is pending",
    stillOneStep.body?.data?.requiresTwoFactor === false,
  );

  // TEST 3 — wrong confirmation code.
  const wrongConfirm = await call("/auth/two-factor/setup/verify", {
    method: "POST",
    body: { code: "000000" },
    token: session,
  });
  const afterWrong = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  check(
    "TEST 3  wrong setup code is rejected and leaves 2FA disabled",
    wrongConfirm.status === 422 && afterWrong.twoFactorEnabled === false,
    `status=${wrongConfirm.status}`,
  );

  // TEST 4 — correct confirmation code.
  const confirm = await call("/auth/two-factor/setup/verify", {
    method: "POST",
    body: { code: await freshCode() },
    token: session,
  });
  const recoveryCodes: string[] = confirm.body?.data?.recoveryCodes ?? [];
  const afterConfirm = await prisma.user.findUniqueOrThrow({
    where: { email: EMAIL },
    omit: { twoFactorSecretEncrypted: false, twoFactorPendingSecretEncrypted: false },
  });
  check(
    "TEST 4  valid code enables 2FA",
    confirm.status === 200 && afterConfirm.twoFactorEnabled === true,
    `status=${confirm.status}`,
  );
  check("TEST 4  recovery codes are returned once (10)", recoveryCodes.length === 10);
  check(
    "TEST 4  live secret is encrypted; pending slot cleared",
    !afterConfirm.twoFactorSecretEncrypted?.includes(secret) &&
      afterConfirm.twoFactorPendingSecretEncrypted === null,
  );
  const storedCodes = await prisma.twoFactorRecoveryCode.findMany({
    where: { userId: afterConfirm.id },
    omit: { codeHash: false },
  });
  check(
    "TEST 4  recovery codes are stored hashed, never in plaintext",
    storedCodes.length === 10 && !storedCodes.some((r) => recoveryCodes.includes(r.codeHash)),
  );

  // TEST 5 — login now stops at a challenge.
  const sessionsBefore = await prisma.authSession.count({ where: { userId: afterConfirm.id } });
  const t5 = await login();
  const challenge1: string = t5.body?.data?.challengeToken;
  check(
    "TEST 5  login returns requiresTwoFactor with no tokens",
    t5.status === 200 &&
      t5.body?.data?.requiresTwoFactor === true &&
      !!challenge1 &&
      t5.body?.data?.accessToken === undefined,
    `status=${t5.status}`,
  );
  check(
    "TEST 5  no session row is created before the second factor",
    (await prisma.authSession.count({ where: { userId: afterConfirm.id } })) === sessionsBefore,
  );
  check("TEST 5  the challenge token is opaque, not a JWT", challenge1.split(".").length === 1);

  // The security claim that matters most.
  const guarded: string[] = [];
  for (const path of ["/auth/me", "/users", "/notifications", "/customers"]) {
    const res = await call(path, { token: challenge1 });
    if (res.status !== 401) guarded.push(`${path}=${res.status}`);
  }
  check(
    "TEST 5  challenge token is rejected by every protected API (401)",
    guarded.length === 0,
    guarded.join(", "),
  );

  // TEST 7 — wrong TOTP.
  const ip7 = nextIp();
  const c7: string = (await login(ip7)).body?.data?.challengeToken;
  const wrongTotp = await call("/auth/two-factor/verify", {
    method: "POST",
    body: { challengeToken: c7, code: "000000" },
    ip: ip7,
  });
  check(
    "TEST 7  wrong authenticator code denies login",
    wrongTotp.status === 401 && !wrongTotp.body?.data,
    `status=${wrongTotp.status}`,
  );

  // TEST 6 — correct TOTP.
  const ip6 = nextIp();
  const c6: string = (await login(ip6)).body?.data?.challengeToken;
  const code6 = await freshCode();
  const okTotp = await call("/auth/two-factor/verify", {
    method: "POST",
    body: { challengeToken: c6, code: code6 },
    ip: ip6,
  });
  session = okTotp.body?.data?.accessToken;
  const me = await call("/auth/me", { token: session });
  check(
    "TEST 6  correct authenticator code completes login",
    okTotp.status === 200 && !!session,
    `status=${okTotp.status}`,
  );
  check(
    "TEST 6  the issued access token works on a protected API",
    me.status === 200 && me.body?.data?.twoFactorEnabled === true,
    `status=${me.status}`,
  );

  // Replay protection.
  const ipR = nextIp();
  const cR: string = (await login(ipR)).body?.data?.challengeToken;
  const replay = await call("/auth/two-factor/verify", {
    method: "POST",
    body: { challengeToken: cR, code: code6 },
    ip: ipR,
  });
  check(
    "REPLAY  a spent TOTP step cannot be reused on a new challenge",
    replay.status === 401,
    `status=${replay.status}`,
  );

  // TEST 8 — recovery code login.
  const ip8 = nextIp();
  const c8: string = (await login(ip8)).body?.data?.challengeToken;
  const rec8 = await call("/auth/two-factor/recovery", {
    method: "POST",
    body: { challengeToken: c8, recoveryCode: recoveryCodes[0] },
    ip: ip8,
  });
  check(
    "TEST 8  a recovery code completes login and reports the remainder",
    rec8.status === 200 &&
      !!rec8.body?.data?.accessToken &&
      rec8.body?.data?.recoveryCodesRemaining === 9,
    `status=${rec8.status}`,
  );

  // TEST 9 — reuse is refused.
  const ip9 = nextIp();
  const c9: string = (await login(ip9)).body?.data?.challengeToken;
  const reuse = await call("/auth/two-factor/recovery", {
    method: "POST",
    body: { challengeToken: c9, recoveryCode: recoveryCodes[0] },
    ip: ip9,
  });
  check(
    "TEST 9  the same recovery code cannot be used twice",
    reuse.status === 401,
    `status=${reuse.status}`,
  );

  // TEST 13 — per-challenge attempt cap.
  const ip13 = nextIp();
  const c13: string = (await login(ip13)).body?.data?.challengeToken;
  let burned = false;
  for (let i = 0; i < 5; i += 1) {
    const res = await call("/auth/two-factor/verify", {
      method: "POST",
      body: { challengeToken: c13, code: "000000" },
      ip: ip13,
    });
    if (res.status === 429 && res.body?.error?.context?.reason === "two_factor_too_many_attempts") {
      burned = true;
      break;
    }
  }
  check("TEST 13  repeated wrong codes burn the challenge (429)", burned);
  const deadChallenge = await call("/auth/two-factor/verify", {
    method: "POST",
    body: { challengeToken: c13, code: await freshCode() },
    ip: nextIp(),
  });
  check(
    "TEST 13  the burned challenge is dead server-side, not merely throttled",
    deadChallenge.status === 401 &&
      deadChallenge.body?.error?.context?.reason === "two_factor_challenge_invalid",
    `status=${deadChallenge.status}`,
  );

  const ipRL = nextIp();
  let rateLimited = false;
  for (let i = 0; i < 8; i += 1) {
    const res = await login(ipRL, "wrong-password");
    if (res.status === 429) {
      rateLimited = true;
      break;
    }
  }
  check("TEST 13  the per-IP login rate limit engages", rateLimited);

  // TEST 10 — regenerate.
  const ipRe = nextIp();
  const cRe: string = (await login(ipRe)).body?.data?.challengeToken;
  session = (
    await call("/auth/two-factor/verify", {
      method: "POST",
      body: { challengeToken: cRe, code: await freshCode() },
      ip: ipRe,
    })
  ).body?.data?.accessToken;

  const regen = await call("/auth/two-factor/recovery-codes", {
    method: "POST",
    body: { password: PASSWORD, recoveryCode: recoveryCodes[1] },
    token: session,
  });
  const newCodes: string[] = regen.body?.data?.recoveryCodes ?? [];
  check(
    "TEST 10  regeneration returns a fresh, disjoint set",
    regen.status === 200 &&
      newCodes.length === 10 &&
      !newCodes.some((c) => recoveryCodes.includes(c)),
    `status=${regen.status}`,
  );

  const ipOld = nextIp();
  const cOld: string = (await login(ipOld)).body?.data?.challengeToken;
  const oldCode = await call("/auth/two-factor/recovery", {
    method: "POST",
    body: { challengeToken: cOld, recoveryCode: recoveryCodes[5] },
    ip: ipOld,
  });
  check("TEST 10  an old recovery code no longer works", oldCode.status === 401);

  const ipNew = nextIp();
  const cNew: string = (await login(ipNew)).body?.data?.challengeToken;
  const newCode = await call("/auth/two-factor/recovery", {
    method: "POST",
    body: { challengeToken: cNew, recoveryCode: newCodes[0] },
    ip: ipNew,
  });
  check("TEST 10  a new recovery code works", newCode.status === 200);

  // TEST 11 — disable requires real re-authentication.
  const ipD = nextIp();
  const cD: string = (await login(ipD)).body?.data?.challengeToken;
  session = (
    await call("/auth/two-factor/verify", {
      method: "POST",
      body: { challengeToken: cD, code: await freshCode() },
      ip: ipD,
    })
  ).body?.data?.accessToken;

  const noFactor = await call("/auth/two-factor/disable", {
    method: "POST",
    body: { password: PASSWORD },
    token: session,
  });
  check(
    "TEST 11  disable without a second factor is refused",
    noFactor.status === 422 &&
      noFactor.body?.error?.context?.reason === "two_factor_second_factor_required",
    `status=${noFactor.status}`,
  );

  const badPassword = await call("/auth/two-factor/disable", {
    method: "POST",
    body: { password: "nope", recoveryCode: newCodes[9] },
    token: session,
  });
  check(
    "TEST 11  disable with a wrong password is refused",
    badPassword.status === 422 &&
      badPassword.body?.error?.context?.reason === "two_factor_password_invalid",
    `status=${badPassword.status}`,
  );

  const disable = await call("/auth/two-factor/disable", {
    method: "POST",
    body: { password: PASSWORD, code: await freshCode() },
    token: session,
  });
  const afterDisable = await prisma.user.findUniqueOrThrow({
    where: { email: EMAIL },
    omit: { twoFactorSecretEncrypted: false },
  });
  check(
    "TEST 11  disable with password + code succeeds and wipes the secret",
    disable.status === 200 &&
      afterDisable.twoFactorEnabled === false &&
      afterDisable.twoFactorSecretEncrypted === null &&
      (await prisma.twoFactorRecoveryCode.count({ where: { userId: afterDisable.id } })) === 0,
    `status=${disable.status}`,
  );

  // TEST 12 — back to one-step.
  const t12 = await login();
  check(
    "TEST 12  after disabling, login is one-step again",
    t12.status === 200 &&
      t12.body?.data?.requiresTwoFactor === false &&
      !!t12.body?.data?.accessToken,
  );

  // Audit hygiene.
  const audit = await prisma.auditLog.findMany({
    where: { actorUserId: afterDisable.id },
  });
  const actions = new Set(audit.map((a) => a.action));
  check(
    "AUDIT   the security events are recorded",
    ["setup_started", "enabled", "disabled", "recovery_codes_regenerated"].every((a) =>
      actions.has(`security.two_factor.${a}`),
    ),
    [...actions].join(", "),
  );
  const auditText = JSON.stringify(audit);
  check(
    "AUDIT   no secret, code, URI or password appears in the audit log",
    !auditText.includes(secret) &&
      !auditText.includes("otpauth://") &&
      !auditText.includes(PASSWORD) &&
      ![...recoveryCodes, ...newCodes].some((c) => auditText.includes(c)),
  );

  await prisma.user.delete({ where: { email: EMAIL } });

  console.log(results.join("\n"));
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.user.delete({ where: { email: EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
