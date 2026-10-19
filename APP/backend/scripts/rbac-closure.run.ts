/**
 * RBAC certification closure (zero side-effect, multi-role union, browser seed).
 * haidara_test only. RUN_INTEGRATION=true tsx scripts/rbac-closure.run.ts
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { companyId } from "../tests/helpers/operating-company";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PREFIX = "RBAC_CERT";
const PASSWORD = "RBAC_CERT_CLOSURE_PASS";

type Result = { name: string; pass: boolean; detail: string };

const results: Result[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
}

function resolveTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL ?? "";
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  const testUrl = explicit || devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(testUrl);
  return testUrl;
}

async function assertDb(prisma: PrismaClient): Promise<void> {
  const row = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database()::text AS db`;
  assert.equal(row[0]?.db, "haidara_test");
}

async function upsertPerm(prisma: PrismaClient, key: string): Promise<number> {
  const p = await prisma.permission.upsert({
    where: { key },
    update: {},
    create: { key, category: "functional_v2", description: key },
  });
  return p.id;
}

async function ensureRole(
  prisma: PrismaClient,
  roleKey: string,
  keys: string[],
): Promise<number> {
  const role = await prisma.role.upsert({
    where: { key: roleKey },
    update: {},
    create: { key: roleKey, name: roleKey },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  for (const key of keys) {
    const pid = await upsertPerm(prisma, key);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: pid } });
  }
  return role.id;
}

async function ensureUser(
  prisma: PrismaClient,
  suffix: string,
  roleIds: number[],
): Promise<string> {
  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const email = normalizeEmail(`${PREFIX}_${suffix}@closure.test`);
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: { status: "ACTIVE", passwordHash, name: `${PREFIX}_${suffix}` },
    create: { email, status: "ACTIVE", passwordHash, name: `${PREFIX}_${suffix}` },
  });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  for (const roleId of roleIds) {
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
  }
  return email;
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password: PASSWORD },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().data.accessToken as string;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function cleanup(prisma: PrismaClient): Promise<void> {
  const certVehicles = await prisma.vehicle.findMany({
    where: { plateNumber: { startsWith: PREFIX } },
    select: { id: true },
  });
  const vehicleIds = certVehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.contract.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.maintenanceOrder.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  await prisma.manualExpense.deleteMany({ where: { description: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { contains: "closure.test" } } });
  await prisma.userRole.deleteMany({ where: { role: { key: { startsWith: PREFIX } } } });
  await prisma.rolePermission.deleteMany({ where: { role: { key: { startsWith: PREFIX } } } });
  await prisma.role.deleteMany({ where: { key: { startsWith: PREFIX } } });
}

async function testZeroSideEffect(
  app: FastifyInstance,
  prisma: PrismaClient,
  run: string,
): Promise<void> {
  const denyRole = await ensureRole(prisma, `${PREFIX}_VEH_DENY`, [FN.vehicles.viewPage]);
  const denyEmail = await ensureUser(prisma, "veh_deny", [denyRole]);
  const plate = `RBAC-DENY-${run}`;
  const before = await prisma.vehicle.findMany({ where: { plateNumber: plate } });
  const token = await login(app, denyEmail);
  const res = await app.inject({
    method: "POST",
    url: "/vehicles",
    headers: auth(token),
    payload: {
      companyId: await companyId(prisma),
      vehicleName: `${PREFIX} Deny`,
      plateNumber: plate,
      dailyRate: 100,
      monthlyRate: 2000,
    },
  });
  const after = await prisma.vehicle.findMany({ where: { plateNumber: plate } });
  const noSideEffect = before.length === after.length && after.length === 0;
  const pass = res.statusCode === 403 && noSideEffect;
  record(
    "ZERO vehicles POST /vehicles",
    pass,
    `status=${res.statusCode} rows before=${before.length} after=${after.length}${pass ? "" : ` body=${res.body.slice(0, 200)}`}`,
  );

  const finDenyRole = await ensureRole(prisma, `${PREFIX}_FIN_DENY`, [FN.finance.viewPage]);
  const finEmail = await ensureUser(prisma, "fin_deny", [finDenyRole]);
  const desc = `${PREFIX}_FIN_DENY_${run}`;
  const finBefore = await prisma.manualExpense.findMany({ where: { description: desc } });
  const finToken = await login(app, finEmail);
  const finRes = await app.inject({
    method: "POST",
    url: "/finance/expenses",
    headers: auth(finToken),
    payload: {
      amount: 10,
      category: "OTHER",
      recognizedAt: new Date().toISOString(),
      description: desc,
    },
  });
  const finAfter = await prisma.manualExpense.findMany({ where: { description: desc } });
  record(
    "ZERO finance POST manual-expenses",
    finRes.statusCode === 403 && finBefore.length === finAfter.length,
    `status=${finRes.statusCode} rows ${finBefore.length}->${finAfter.length}`,
  );

  const vehicle = await prisma.vehicle.create({
    data: {
      companyId: await companyId(prisma),
      vehicleName: `${PREFIX} Offer`,
      plateNumber: `${PREFIX}_OFF_${run}`,
      operationalStatus: "AVAILABLE",
    },
  });
  const ctDenyRole = await ensureRole(prisma, `${PREFIX}_CT_DENY`, [FN.contracts.viewPage]);
  const ctEmail = await ensureUser(prisma, "ct_deny", [ctDenyRole]);
  const ctBefore = await prisma.contract.count({
    where: { vehicleId: vehicle.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  const ctToken = await login(app, ctEmail);
  const offerPayload = {
    vehicleId: vehicle.id,
    priceType: "DAILY",
    rentalDays: 2,
    agreedAmount: 500,
    collectionMode: "ELECTRONIC",
  };
  const ctRes = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: auth(ctToken),
    payload: offerPayload,
  });
  const ctAfter = await prisma.contract.count({
    where: { vehicleId: vehicle.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  record(
    "ZERO contracts POST /contracts/offers",
    ctRes.statusCode === 403 && ctBefore === ctAfter,
    `status=${ctRes.statusCode} contracts ${ctBefore}->${ctAfter}`,
  );

  const usrDenyRole = await ensureRole(prisma, `${PREFIX}_USR_DENY`, [FN.users.viewPage]);
  const usrEmail = await ensureUser(prisma, "usr_deny", [usrDenyRole]);
  const newEmail = `${PREFIX}_create_block_${run}@closure.test`;
  const usrBefore = await prisma.user.count({ where: { email: newEmail } });
  const usrToken = await login(app, usrEmail);
  const usrRes = await app.inject({
    method: "POST",
    url: "/users",
    headers: auth(usrToken),
    payload: { email: newEmail, name: PREFIX, password: PASSWORD },
  });
  const usrAfter = await prisma.user.count({ where: { email: newEmail } });
  record(
    "ZERO users POST /users",
    usrRes.statusCode === 403 && usrBefore === usrAfter,
    `status=${usrRes.statusCode} users ${usrBefore}->${usrAfter}`,
  );
}

async function setUserRoles(prisma: PrismaClient, email: string, roleIds: number[]): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  for (const roleId of roleIds) {
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
  }
}

async function testMultiRoleUnion(
  app: FastifyInstance,
  prisma: PrismaClient,
  run: string,
): Promise<void> {
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId: await companyId(prisma),
      vehicleName: `${PREFIX} Union CT`,
      plateNumber: `${PREFIX}_UN_CT_${run}`,
      operationalStatus: "AVAILABLE",
    },
  });
  const roleA = await ensureRole(prisma, `${PREFIX}_CT_A`, [FN.contracts.viewPage]);
  const roleB = await ensureRole(prisma, `${PREFIX}_CT_B`, [FN.contracts.rentalLink]);
  const roleC = await ensureRole(prisma, `${PREFIX}_CT_C`, [FN.contracts.rentalLink]);
  const email = await ensureUser(prisma, "union_ct", [roleA]);
  const payload = {
    vehicleId: vehicle.id,
    priceType: "DAILY",
    rentalDays: 2,
    agreedAmount: 600,
    collectionMode: "ELECTRONIC",
  };
  const probe = async (roleIds: number[]) => {
    await setUserRoles(prisma, email, roleIds);
    const token = await login(app, email);
    const res = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(token),
      payload,
    });
    return res.statusCode;
  };
  const s1 = await probe([roleA]);
  const s2 = await probe([roleA, roleB]);
  const s3 = await probe([roleA, roleC]);
  const s4 = await probe([roleA]);
  const s5 = await probe([roleA, roleB]);
  const pass =
    s1 === 403 && (s2 === 201 || s2 === 200) && (s3 === 201 || s3 === 200) && s4 === 403 && (s5 === 201 || s5 === 200);
  record(
    "MULTI contracts offers",
    pass,
    `A=${s1} A+B=${s2} A+C=${s3} A=${s4} A+B=${s5}`,
  );

  const roleFinA = await ensureRole(prisma, `${PREFIX}_FIN_A`, [FN.finance.viewPage]);
  const roleFinB = await ensureRole(prisma, `${PREFIX}_FIN_B`, [FN.finance.addExpense]);
  const roleFinC = await ensureRole(prisma, `${PREFIX}_FIN_C`, [FN.finance.addExpense]);
  const finEmail = await ensureUser(prisma, "union_fin", [roleFinA]);
  const finDesc = `${PREFIX}_UNION_FIN_${run}`;
  const finPayload = {
    amount: 11,
    category: "OTHER",
    recognizedAt: new Date().toISOString(),
    description: finDesc,
  };
  const finProbe = async (roleIds: number[]) => {
    await setUserRoles(prisma, finEmail, roleIds);
    const token = await login(app, finEmail);
    return (
      await app.inject({
        method: "POST",
        url: "/finance/expenses",
        headers: auth(token),
        payload: finPayload,
      })
    ).statusCode;
  };
  const f1 = await finProbe([roleFinA]);
  const f2 = await finProbe([roleFinA, roleFinB]);
  const f3 = await finProbe([roleFinA, roleFinC]);
  const f4 = await finProbe([roleFinA]);
  const f5 = await finProbe([roleFinA, roleFinB]);
  record(
    "MULTI finance expense",
    f1 === 403 &&
      (f2 === 201 || f2 === 200) &&
      (f3 === 201 || f3 === 200) &&
      f4 === 403 &&
      (f5 === 201 || f5 === 200),
    `A=${f1} A+B=${f2} A+C=${f3} A=${f4} A+B=${f5}`,
  );

  const target = await prisma.user.findFirstOrThrow({
    where: { email: { contains: "admin@diamond.test" } },
    select: { id: true },
  });
  const roleUsrA = await ensureRole(prisma, `${PREFIX}_USR_A`, [FN.users.viewPage]);
  const roleUsrB = await ensureRole(prisma, `${PREFIX}_USR_B`, [FN.users.edit]);
  const roleUsrC = await ensureRole(prisma, `${PREFIX}_USR_C`, [FN.users.edit]);
  const usrUnionEmail = await ensureUser(prisma, "union_usr", [roleUsrA]);
  const usrProbe = async (roleIds: number[]) => {
    await setUserRoles(prisma, usrUnionEmail, roleIds);
    const token = await login(app, usrUnionEmail);
    return (
      await app.inject({
        method: "PUT",
        url: `/users/${target.id}`,
        headers: auth(token),
        payload: { name: `${PREFIX}_UNION_${Date.now()}` },
      })
    ).statusCode;
  };
  const u1 = await usrProbe([roleUsrA]);
  const u2 = await usrProbe([roleUsrA, roleUsrB]);
  const u3 = await usrProbe([roleUsrA, roleUsrC]);
  const u4 = await usrProbe([roleUsrA]);
  const u5 = await usrProbe([roleUsrA, roleUsrB]);
  record(
    "MULTI users update",
    u1 === 403 && u2 === 200 && u3 === 200 && u4 === 403 && u5 === 200,
    `A=${u1} A+B=${u2} A+C=${u3} A=${u4} A+B=${u5}`,
  );
}

async function seedBrowserUsers(prisma: PrismaClient): Promise<void> {
  const emptyRoleId = await ensureRole(prisma, `${PREFIX}_BROWSER_EMPTY`, []);
  await ensureUser(prisma, "browser_empty", [emptyRoleId]);
  const allPageKeys = [
    FN.dashboard.full,
    FN.vehicles.viewPage,
    FN.gps.full,
    FN.maintenance.viewPage,
    FN.archive.full,
    FN.violations.viewPage,
    FN.finance.viewPage,
    FN.invoices.viewPage,
    FN.contracts.viewPage,
    FN.whatsapp.full,
    FN.users.viewPage,
    FN.roles.viewPage,
  ];
  await ensureUser(prisma, "browser_all_pages", [
    await ensureRole(prisma, `${PREFIX}_BROWSER_PAGES`, allPageKeys),
  ]);
  await ensureUser(prisma, "browser_veh_view", [
    await ensureRole(prisma, `${PREFIX}_BROWSER_VEH_VIEW`, [FN.vehicles.viewPage]),
  ]);
}

async function main(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl();
  process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
  process.env.TEST_DATABASE_URL = testUrl;
  process.env.DATABASE_URL = testUrl;
  process.env.RATE_LIMIT_AUTH_MAX = "100000";
  process.env.LOG_LEVEL = "silent";

  const run = Date.now().toString(36);
  const { buildApp } = await import("src/app");
  const app = await buildApp();
  const prisma = app.prisma;
  await assertDb(prisma);
  assert.equal(extractPostgresDatabaseName(testUrl), "haidara_test");

  try {
    await cleanup(prisma);
  } catch (e) {
    console.warn("cleanup skipped:", (e as Error).message);
  }
  for (const key of Object.values(FN).flatMap((g) => Object.values(g))) {
    await upsertPerm(prisma, key);
  }

  await testZeroSideEffect(app, prisma, run);
  await testMultiRoleUnion(app, prisma, run);
  await seedBrowserUsers(prisma);

  const outPath = path.join(__dirname, ".rbac-closure-browser.env.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        password: PASSWORD,
        emptyEmail: `${PREFIX}_browser_empty@closure.test`,
        allPagesEmail: `${PREFIX}_browser_all_pages@closure.test`,
        vehViewEmail: `${PREFIX}_browser_veh_view@closure.test`,
      },
      null,
      2,
    ),
  );

  const doCleanup = process.argv.includes("--cleanup");
  if (doCleanup) {
    await cleanup(prisma);
  }
  await app.close();
  await prisma.$disconnect();

  const zero = results.filter((r) => r.name.startsWith("ZERO")).every((r) => r.pass);
  const multi = results.filter((r) => r.name.startsWith("MULTI")).every((r) => r.pass);

  console.log("\n## RBAC CLOSURE BACKEND\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`);
  }
  console.log(`\nZERO_SIDE_EFFECT_ON_DENY = ${zero ? "PASS" : "FAIL"}`);
  console.log(`MULTI_ROLE_UNION = ${multi ? "PASS" : "FAIL"}`);
  console.log(`BROWSER_SEED = ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
