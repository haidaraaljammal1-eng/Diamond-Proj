/**
 * Runtime verification of the admin user-password feature against the LIVE
 * server on :4000. Real HTTP, real database, real argon2 hashes.
 *
 * Covers the required tests (§17):
 *   1  admin creates a user WITH a password (201, ACTIVE, no invite)
 *   1b the new user can log in with that password
 *   2  password / confirmation mismatch → validation error, user not created
 *   3  editing normal data does NOT change the password
 *   4  authorized admin resets a password → new works, old fails
 *   5  a holder of users.update but NOT users.reset_password → 403 (separation)
 *   6  enforcement is server-side (permission), not just a hidden button
 *   7  GET user detail never exposes a password / hash
 *   8  audit row recorded (users.reset_password) with NO secret
 *   9  self-service forgot-password still works
 *  10  admin reset revokes the target's existing sessions
 *
 * Run from the backend repo root, with the server running:  npx tsx scripts/verify-user-password.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { hashPassword } from "src/lib/security/password";

const BASE = "http://localhost:4000";
const STAMP = Date.now().toString(36);
const ADMIN_EMAIL = env.DEV_ADMIN_EMAIL ?? "admin@admin.com";
const ADMIN_PASSWORD = env.DEV_ADMIN_PASSWORD ?? "12345678";

// Mirrors the app's client + global omit, so a field this script can read only
// via an explicit override is a field the API itself cannot leak.
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
  },
});

let ipCounter = 0;
const nextIp = () => `172.29.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

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
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

const login = (email: string, password: string) =>
  call("/auth/login", { method: "POST", body: { email, password } });

/** Read the real passwordHash (bypassing the global omit) for assertions. */
async function readHash(userId: number): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true } as any,
  });
  return (row as any)?.passwordHash ?? null;
}

const createdUserIds: number[] = [];
let limitedRoleId: number | null = null;

async function main() {
  // ── admin session ──────────────────────────────────────────────────────────
  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminToken: string = adminLogin.body?.data?.accessToken;
  check("admin can log in", adminLogin.status === 200 && !!adminToken, `status ${adminLogin.status}`);
  if (!adminToken) return;
  const adminRow = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });
  const adminId = adminRow?.id ?? null;

  // ── TEST 1 — create WITH password ───────────────────────────────────────────
  const email1 = `pw-verify-1-${STAMP}@ex.test`;
  const PW1 = "Str0ngPass!1";
  const created = await call("/users", {
    method: "POST",
    token: adminToken,
    body: { email: email1, name: "PW Verify One", roleIds: [], departmentIds: [], password: PW1, confirmPassword: PW1 },
  });
  const user1 = created.body?.data?.user;
  const user1Id: number | undefined = user1?.id;
  if (user1Id) createdUserIds.push(user1Id);
  check("TEST 1  create-with-password → 201", created.status === 201, `status ${created.status}`);
  check("TEST 1  account created ACTIVE (no PENDING invite)", user1?.status === "ACTIVE", `status ${user1?.status}`);
  check("TEST 1  setup invite is null (nothing to hand off)", created.body?.data?.setup === null);
  check("TEST 1  no email sent (SKIPPED)", created.body?.data?.email?.status === "SKIPPED");
  const createBlob = JSON.stringify(created.body).toLowerCase();
  check(
    "TEST 1  response leaks no password / hash",
    !createBlob.includes("passwordhash") &&
      !createBlob.includes(PW1.toLowerCase()) &&
      !createBlob.includes("confirmpassword"),
  );
  check("TEST 1  passwordHash stored (argon2)", !!user1Id && !!(await readHash(user1Id))?.startsWith("$argon2"));

  // ── TEST 1b — new user can log in with the password ─────────────────────────
  const u1Login = await login(email1, PW1);
  const u1Refresh: string = u1Login.body?.data?.refreshToken;
  check("TEST 1b new user logs in with the set password", u1Login.status === 200 && !!u1Login.body?.data?.accessToken, `status ${u1Login.status}`);

  // ── TEST 2 — mismatch → validation error, user not created ──────────────────
  const email2 = `pw-verify-2-${STAMP}@ex.test`;
  const mism = await call("/users", {
    method: "POST",
    token: adminToken,
    body: { email: email2, name: "PW Verify Two", roleIds: [], departmentIds: [], password: "Str0ngPass!1", confirmPassword: "different" },
  });
  check("TEST 2  mismatch rejected (422)", mism.status === 422, `status ${mism.status}`);
  const notCreated = await prisma.user.count({ where: { email: email2 } });
  check("TEST 2  user NOT created on mismatch", notCreated === 0);

  // ── TEST 3 — editing normal data does not change the password ───────────────
  const hashBefore = user1Id ? await readHash(user1Id) : null;
  const edit = await call(`/users/${user1Id}`, { method: "PUT", token: adminToken, body: { name: "PW Verify One Renamed" } });
  const hashAfter = user1Id ? await readHash(user1Id) : null;
  check("TEST 3  profile edit → 200", edit.status === 200, `status ${edit.status}`);
  check("TEST 3  passwordHash unchanged by profile edit", !!hashBefore && hashBefore === hashAfter);

  // ── TEST 4 + 10 — admin reset: new works, old fails, sessions revoked ───────
  const PW1_NEW = "N3wStr0ngPass!2";
  const reset = await call(`/users/${user1Id}/reset-password`, {
    method: "POST",
    token: adminToken,
    body: { newPassword: PW1_NEW, confirmPassword: PW1_NEW },
  });
  check("TEST 4  admin reset → 200", reset.status === 200, `status ${reset.status}`);
  const resetBlob = JSON.stringify(reset.body).toLowerCase();
  check("TEST 4  reset response leaks no password / hash", !resetBlob.includes("passwordhash") && !resetBlob.includes(PW1_NEW.toLowerCase()));
  const oldLogin = await login(email1, PW1);
  check("TEST 4  OLD password no longer works", oldLogin.status === 401, `status ${oldLogin.status}`);
  const newLogin = await login(email1, PW1_NEW);
  check("TEST 4  NEW password works", newLogin.status === 200 && !!newLogin.body?.data?.accessToken, `status ${newLogin.status}`);
  const refreshOld = await call("/auth/refresh", { method: "POST", body: { refreshToken: u1Refresh } });
  check("TEST 10 pre-reset session revoked (refresh rejected)", refreshOld.status === 401, `status ${refreshOld.status}`);

  // ── TEST 5 + 6 — separation: users.update WITHOUT reset_password → 403 ───────
  const perms = await prisma.permission.findMany({
    where: { key: { in: ["users.read", "users.create", "users.update"] } },
    select: { id: true },
  });
  const limitedRole = await prisma.role.create({
    data: { key: `pw-verify-limited-${STAMP}`, name: "PW Verify Limited", description: "no reset_password" },
  });
  limitedRoleId = limitedRole.id;
  await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: limitedRole.id, permissionId: p.id })) });
  const limitedEmail = `pw-verify-limited-${STAMP}@ex.test`;
  const LIMITED_PW = "L1mitedPass!3";
  const limitedUser = await prisma.user.create({
    data: {
      email: limitedEmail,
      name: "PW Verify Limited User",
      status: "ACTIVE",
      passwordHash: await hashPassword(LIMITED_PW),
      roles: { create: [{ roleId: limitedRole.id }] },
    } as any,
  });
  createdUserIds.push(limitedUser.id);
  const limitedLogin = await login(limitedEmail, LIMITED_PW);
  const limitedToken: string = limitedLogin.body?.data?.accessToken;
  check("TEST 5  limited user (users.update, no reset) can log in", limitedLogin.status === 200 && !!limitedToken);
  const forbidden = await call(`/users/${user1Id}/reset-password`, {
    method: "POST",
    token: limitedToken,
    body: { newPassword: "Hacker!Pass9", confirmPassword: "Hacker!Pass9" },
  });
  check("TEST 5/6 users.update WITHOUT users.reset_password → 403 (server-enforced)", forbidden.status === 403, `status ${forbidden.status}`);
  const stillNew = await login(email1, PW1_NEW);
  check("TEST 6  forbidden attempt did NOT change the password", stillNew.status === 200, `status ${stillNew.status}`);

  // ── TEST 7 — GET detail never exposes password / hash ───────────────────────
  const detail = await call(`/users/${user1Id}`, { token: adminToken });
  const detailBlob = JSON.stringify(detail.body).toLowerCase();
  check("TEST 7  GET user detail → 200", detail.status === 200);
  check("TEST 7  detail has no password / hash", !detailBlob.includes("password"));

  // ── TEST 8 — audit row with no secret ───────────────────────────────────────
  const auditRow = await prisma.auditLog.findFirst({
    where: { action: "users.reset_password", entityId: String(user1Id) },
    orderBy: { id: "desc" },
  });
  check("TEST 8  audit row 'users.reset_password' recorded", !!auditRow);
  check("TEST 8  audit actor = admin, target = user", !!adminId && auditRow?.actorUserId === adminId && auditRow?.entityId === String(user1Id));
  const auditBlob = JSON.stringify(auditRow ?? {}).toLowerCase();
  check(
    "TEST 8  audit carries NO password / hash",
    !auditBlob.includes("passwordhash") &&
      !auditBlob.includes(PW1_NEW.toLowerCase()) &&
      !auditBlob.includes("newpassword") &&
      !auditBlob.includes("confirmpassword"),
  );

  // ── TEST 9 — self-service forgot-password still works ───────────────────────
  const tokensBefore = await prisma.securityToken.count({ where: { userId: user1Id, scope: "PASSWORD_RESET" } });
  const forgot = await call("/auth/password-reset-request", { method: "POST", body: { email: email1 } });
  const tokensAfter = await prisma.securityToken.count({ where: { userId: user1Id, scope: "PASSWORD_RESET" } });
  check("TEST 9  forgot-password request → 200", forgot.status === 200, `status ${forgot.status}`);
  check("TEST 9  forgot-password issued a PASSWORD_RESET token", tokensAfter === tokensBefore + 1);
}

async function cleanup() {
  try {
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (limitedRoleId) await prisma.role.delete({ where: { id: limitedRoleId } }).catch(() => {});
  } catch (err) {
    console.warn("cleanup warning:", err);
  }
}

main()
  .catch((err) => {
    console.error(err);
    failed += 1;
    results.push(`  FAIL  unexpected error — ${String(err)}`);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log("\n── USER PASSWORD MANAGEMENT — RUNTIME VERIFICATION ──\n");
    console.log(results.join("\n"));
    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
