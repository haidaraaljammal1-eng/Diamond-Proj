/**
 * Seed RBAC browser certification personas (haidara_test only).
 * RBAC_BROWSER_RUN_ID required. Writes scripts/.rbac-browser-cert.env.json
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { companyId } from "../tests/helpers/operating-company";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PASSWORD = process.env.RBAC_BROWSER_CERT_PASS ?? "RBAC_BROWSER_CERT_PASS";

async function main(): Promise<void> {
  const runId = process.env.RBAC_BROWSER_RUN_ID?.trim();
  if (!runId) throw new Error("RBAC_BROWSER_RUN_ID is required");

  const testUrl =
    process.env.TEST_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(testUrl!);
  process.env.DATABASE_URL = testUrl;
  process.env.TEST_DATABASE_URL = testUrl;

  const prefix = `RBAC_BROW_${runId}`;
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });

  const dbRow = (await prisma.$queryRaw<{ db: string }[]>`SELECT current_database()::text AS db`)[0];
  assert.ok(dbRow, "database identity query returned no row");
  const db = dbRow.db;
  assert.equal(db, "haidara_test");

  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");

  async function upsertPerm(key: string) {
    return prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: "functional_v2", description: key },
    });
  }

  async function role(keys: string[], suffix: string) {
    const roleKey = `${prefix}_${suffix}`;
    const r = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    for (const key of keys) {
      const p = await upsertPerm(key);
      await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: p.id } });
    }
    return r.id;
  }

  async function user(suffix: string, roleIds: number[]) {
    const email = normalizeEmail(`${prefix}_${suffix}@cert.browser.test`);
    const passwordHash = await hashPassword(PASSWORD);
    const u = await prisma.user.upsert({
      where: { email },
      update: { status: "ACTIVE", passwordHash, name: `${prefix}_${suffix}` },
      create: { email, status: "ACTIVE", passwordHash, name: `${prefix}_${suffix}` },
    });
    await prisma.userRole.deleteMany({ where: { userId: u.id } });
    for (const roleId of roleIds) {
      await prisma.userRole.create({ data: { userId: u.id, roleId } });
    }
    return email;
  }

  for (const key of Object.values(FN).flatMap((g) => Object.values(g))) {
    await upsertPerm(key);
  }

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

  const emptyRole = await role([], "empty");
  const allPagesRole = await role(allPageKeys, "all_pages");
  const vehViewRole = await role([FN.vehicles.viewPage], "veh_view");
  const vehFleetRole = await role([FN.vehicles.viewPage, FN.vehicles.addDelete], "veh_fleet");
  const usersEditRole = await role([FN.users.viewPage, FN.users.edit], "users_edit");
  const financeViewRole = await role([FN.finance.viewPage], "finance_view");
  const rolesMatrixRole = await role(
    [FN.roles.viewPage, FN.roles.managePermissions],
    "roles_matrix",
  );
  const contractsOpsRole = await role(
    [FN.contracts.viewPage, FN.contracts.operationsClosure],
    "contracts_ops",
  );
  const pickerRole = await role([], "picker");

  const emptyEmail = await user("empty", [emptyRole]);
  const allPagesEmail = await user("all_pages", [allPagesRole]);
  const vehViewEmail = await user("veh_view", [vehViewRole]);
  const vehFleetEmail = await user("veh_fleet", [vehFleetRole]);
  const usersEditEmail = await user("users_edit", [usersEditRole]);
  const financeViewEmail = await user("finance_view", [financeViewRole]);
  const rolesMatrixEmail = await user("roles_matrix", [rolesMatrixRole]);
  const contractsOpsEmail = await user("contracts_ops", [contractsOpsRole]);
  const editTargetEmail = await user("edit_target", [pickerRole]);

  const cid = await companyId(prisma);
  const plate = `${prefix}-VEH`;
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId: cid,
      vehicleName: `${prefix} Vehicle`,
      plateNumber: plate,
      operationalStatus: "AVAILABLE",
      dailyRate: 100,
      monthlyRate: 2000,
    },
  });
  const admin = await prisma.user.findFirst({ where: { email: { contains: "admin" } } });
  const paidContract = await prisma.contract.create({
    data: {
      companyId: cid,
      contractNumber: `${prefix}-PAID`,
      status: "PAID",
      vehicleId: vehicle.id,
      createdByUserId: admin?.id ?? 1,
      priceType: "DAILY",
      rentalDays: 2,
      durationValue: 2,
      durationUnit: "DAY",
      agreedAmount: 500,
      collectionMode: "ELECTRONIC",
    },
  });

  const out = {
    runId,
    prefix,
    password: PASSWORD,
    emptyEmail,
    allPagesEmail,
    vehViewEmail,
    vehFleetEmail,
    usersEditEmail,
    financeViewEmail,
    rolesMatrixEmail,
    contractsOpsEmail,
    editTargetEmail,
    paidContractId: paidContract.id,
    contractNumber: paidContract.contractNumber,
  };

  writeFileSync(path.join(__dirname, ".rbac-browser-cert.env.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, runId, seed: out }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
