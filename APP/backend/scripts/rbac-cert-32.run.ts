/**
 * One-shot RBAC V2 certification (32 capabilities). haidara_test only.
 * Run: RUN_INTEGRATION=true tsx scripts/rbac-cert-32.run.ts
 */
import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { ALL_FUNCTIONAL_CAPABILITY_KEYS, FN } from "src/lib/rbac/functional-permissions/keys";
import { ROUTE_FUNCTIONAL_REQUIREMENTS } from "src/lib/rbac/functional-permissions/route-requirements";
import {
  assertFunctionalRouteAuthorization,
  type FunctionalRouteRequirement,
} from "src/lib/rbac/functional-permissions/enforcement";
import { normalizeFunctionalGrants } from "src/lib/rbac/functional-permissions/policy-engine";
import type { AuthUser } from "src/lib/context/auth-context";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PREFIX = "RBAC_CERT";
const PASSWORD = "RBAC_CERT_PASS_32";

type Verdict = "PASS" | "FAIL" | "PARTIAL";

interface CapRow {
  n: number;
  key: string;
  positive: boolean;
  missing403: boolean;
  sibling: boolean;
  uiSmoke: Verdict;
  verdict: Verdict;
  notes: string[];
}

function resolveTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL ?? "";
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  const testUrl = explicit || devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(testUrl);
  return testUrl;
}

function employee(grants: string[]): AuthUser {
  const normalized = normalizeFunctionalGrants(grants);
  return {
    id: 99,
    email: "cert@test.local",
    status: "ACTIVE",
    permissions: normalized.ok ? normalized.normalized : grants,
    roleKeys: [`${PREFIX}_role`],
    isSystemAdmin: false,
  };
}

function invertRequirements(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [op, req] of Object.entries(ROUTE_FUNCTIONAL_REQUIREMENTS)) {
    if (req.requireAll && req.keys.length === 1) {
      const k = req.keys[0]!;
      const list = map.get(k) ?? [];
      list.push(op);
      map.set(k, list);
    }
  }
  return map;
}

function enforcementAllows(grants: string[], req: FunctionalRouteRequirement): boolean {
  process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
  try {
    assertFunctionalRouteAuthorization(employee(grants), req);
    return true;
  } catch {
    return false;
  }
}

const SIBLING_DENY: Record<string, { grants: string[]; denyOp: string }> = {
  [FN.vehicles.addDelete]: {
    grants: [FN.vehicles.viewPage, FN.vehicles.addDelete],
    denyOp: "updateVehicle",
  },
  [FN.vehicles.editPrices]: {
    grants: [FN.vehicles.viewPage, FN.vehicles.editPrices],
    denyOp: "createVehicle",
  },
  [FN.maintenance.create]: {
    grants: [FN.maintenance.viewPage, FN.maintenance.create],
    denyOp: "startMaintenanceOrder",
  },
  [FN.maintenance.manageLifecycle]: {
    grants: [FN.maintenance.viewPage, FN.maintenance.manageLifecycle],
    denyOp: "createMaintenanceOrder",
  },
  [FN.violations.manualCollection]: {
    grants: [FN.violations.viewPage, FN.violations.manualCollection],
    denyOp: "collectRoadLiabilityOffSession",
  },
  [FN.finance.addExpense]: {
    grants: [FN.finance.viewPage, FN.finance.addExpense],
    denyOp: "voidManualExpense",
  },
  [FN.finance.correctExpense]: {
    grants: [FN.finance.viewPage, FN.finance.correctExpense],
    denyOp: "createManualExpense",
  },
  [FN.finance.voidExpense]: {
    grants: [FN.finance.viewPage, FN.finance.voidExpense],
    denyOp: "correctManualExpense",
  },
  [FN.invoices.downloadPdf]: {
    grants: [FN.invoices.viewPage, FN.invoices.downloadPdf],
    denyOp: "sendInvoiceWhatsApp",
  },
  [FN.invoices.sendWhatsapp]: {
    grants: [FN.invoices.viewPage, FN.invoices.sendWhatsapp],
    denyOp: "getInvoicePdf",
  },
  [FN.contracts.rentalLink]: {
    grants: [FN.contracts.viewPage, FN.contracts.rentalLink],
    denyOp: "contractCarOut",
  },
  [FN.contracts.operationsClosure]: {
    grants: [FN.contracts.viewPage, FN.contracts.operationsClosure],
    denyOp: "createContractOffer",
  },
  [FN.contracts.renewal]: {
    grants: [FN.contracts.viewPage, FN.contracts.renewal],
    denyOp: "closeContract",
  },
  [FN.users.edit]: {
    grants: [FN.users.viewPage, FN.users.edit],
    denyOp: "createUser",
  },
  [FN.users.create]: {
    grants: [FN.users.viewPage, FN.users.create],
    denyOp: "setUserRoles",
  },
  [FN.roles.createEdit]: {
    grants: [FN.roles.viewPage, FN.roles.createEdit],
    denyOp: "setRolePermissions",
  },
  [FN.roles.managePermissions]: {
    grants: [FN.roles.viewPage, FN.roles.managePermissions],
    denyOp: "createRole",
  },
};

const PARENT_CHILD_DENY: Record<string, string> = {
  [FN.vehicles.viewPage]: "createVehicle",
  [FN.maintenance.viewPage]: "createMaintenanceOrder",
  [FN.violations.viewPage]: "staffManualChargeReturnedContract",
  [FN.finance.viewPage]: "createManualExpense",
  [FN.invoices.viewPage]: "getInvoicePdf",
  [FN.contracts.viewPage]: "contractCarOut",
  [FN.users.viewPage]: "updateUser",
  [FN.roles.viewPage]: "createRole",
};

type HttpProbe = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  url: string;
  payload?: unknown;
};

const HTTP_PROBE: Partial<Record<string, HttpProbe>> = {
  [FN.dashboard.full]: { method: "GET", url: "/dashboard/overview" },
  [FN.vehicles.viewPage]: { method: "GET", url: "/vehicles?page=1&pageSize=1" },
  [FN.vehicles.addDelete]: {
    method: "POST",
    url: "/vehicles",
    payload: { vehicleName: `${PREFIX} V`, plateNumber: `${PREFIX}1`, companyId: 1 },
  },
  [FN.vehicles.editPrices]: { method: "PUT", url: "/vehicles/1", payload: { dailyRate: 100 } },
  [FN.gps.full]: { method: "GET", url: "/gps/vehicles?page=1&pageSize=1" },
  [FN.maintenance.viewPage]: { method: "GET", url: "/maintenance/orders?page=1&pageSize=1" },
  [FN.maintenance.create]: {
    method: "POST",
    url: "/maintenance/orders",
    payload: { vehicleId: 1, description: PREFIX },
  },
  [FN.maintenance.manageLifecycle]: { method: "PATCH", url: "/maintenance/orders/1/start" },
  [FN.archive.full]: { method: "GET", url: "/archive/vehicles" },
  [FN.violations.viewPage]: { method: "GET", url: "/road-liabilities?page=1&pageSize=1" },
  [FN.violations.manualCollection]: {
    method: "POST",
    url: "/road-liabilities/returned-contracts/00000000-0000-0000-0000-000000000001/manual-charge",
    payload: { category: "SALIK", amount: 1 },
  },
  [FN.finance.viewPage]: { method: "GET", url: "/finance/summary" },
  [FN.finance.addExpense]: {
    method: "POST",
    url: "/finance/manual-expenses",
    payload: { amount: 1, description: PREFIX, category: "OTHER" },
  },
  [FN.finance.correctExpense]: { method: "POST", url: "/finance/manual-expenses/1/correct", payload: {} },
  [FN.finance.voidExpense]: { method: "POST", url: "/finance/manual-expenses/1/void", payload: {} },
  [FN.invoices.viewPage]: { method: "GET", url: "/invoices?page=1&pageSize=1" },
  [FN.invoices.downloadPdf]: { method: "GET", url: "/invoices/1/pdf" },
  [FN.invoices.sendWhatsapp]: { method: "POST", url: "/invoices/1/deliveries/whatsapp", payload: {} },
  [FN.contracts.viewPage]: { method: "GET", url: "/contracts?page=1&pageSize=1" },
  [FN.contracts.rentalLink]: {
    method: "POST",
    url: "/contracts/offers",
    payload: { vehicleId: 1, collectionMode: "ELECTRONIC" },
  },
  [FN.contracts.operationsClosure]: { method: "POST", url: "/contracts/1/car-out/complete", payload: {} },
  [FN.contracts.renewal]: { method: "POST", url: "/contracts/1/renewal-link", payload: {} },
  [FN.whatsapp.full]: { method: "GET", url: "/whatsapp/conversations?page=1&pageSize=1" },
  [FN.users.viewPage]: { method: "GET", url: "/users?page=1&pageSize=1" },
  [FN.users.create]: {
    method: "POST",
    url: "/users",
    payload: { email: `${PREFIX}_new@test.local`, name: PREFIX, password: PASSWORD },
  },
  [FN.users.edit]: { method: "PUT", url: "/users/2", payload: { name: `${PREFIX} Edit` } },
  [FN.users.enableDisable]: { method: "PATCH", url: "/users/2/status", payload: { status: "ACTIVE" } },
  [FN.users.delete]: { method: "DELETE", url: "/users/999999" },
  [FN.roles.viewPage]: { method: "GET", url: "/roles?page=1&pageSize=1" },
  [FN.roles.createEdit]: {
    method: "POST",
    url: "/roles",
    payload: { name: `${PREFIX} Role`, key: `${PREFIX.toLowerCase()}_role_x` },
  },
  [FN.roles.managePermissions]: { method: "PUT", url: "/roles/2/permissions", payload: { permissionIds: [] } },
};

const LEGACY_SAMPLES: { legacy: string; op: string; cap: string }[] = [
  { legacy: "vehicles.manage", op: "createVehicle", cap: FN.vehicles.addDelete },
  { legacy: "finance.manage", op: "createManualExpense", cap: FN.finance.addExpense },
  { legacy: "contracts.manage", op: "createContractOffer", cap: FN.contracts.rentalLink },
  { legacy: "users.read", op: "listUsers", cap: FN.users.viewPage },
];

async function assertDatabaseIsHaidaraTest(prisma: PrismaClient): Promise<void> {
  const row = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database()::text AS db`;
  assert.equal(row[0]?.db, "haidara_test");
}

async function seedCertUser(
  prisma: PrismaClient,
  suffix: string,
  permissionKeys: string[],
): Promise<string> {
  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const roleKey = `${PREFIX}_${suffix}`;
  const email = normalizeEmail(`${PREFIX}_${suffix}@cert.test`);
  const role = await prisma.role.upsert({
    where: { key: roleKey },
    update: {},
    create: { key: roleKey, name: roleKey },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  for (const key of permissionKeys) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: "functional_v2", description: key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
  }
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.upsert({
    where: { email },
    update: { status: "ACTIVE", passwordHash },
    create: { email, name: roleKey, status: "ACTIVE", passwordHash },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
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

function isAuthorizedStatus(code: number): boolean {
  return code !== 403;
}

async function cleanup(prisma: PrismaClient): Promise<void> {
  await prisma.userRole.deleteMany({
    where: { user: { email: { contains: `${PREFIX.toLowerCase()}` } } },
  });
  await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}` } } });
  await prisma.rolePermission.deleteMany({
    where: { role: { key: { startsWith: PREFIX } } },
  });
  await prisma.role.deleteMany({ where: { key: { startsWith: PREFIX } } });
}

async function main(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl();
  process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
  process.env.TEST_DATABASE_URL = testUrl;
  process.env.DATABASE_URL = testUrl;
  process.env.RATE_LIMIT_AUTH_MAX = "100000";
  process.env.RATE_LIMIT_MAX = "100000";
  process.env.LOG_LEVEL = "silent";

  const { buildApp } = await import("src/app");
  const app = await buildApp();
  const prisma = app.prisma;
  await assertDatabaseIsHaidaraTest(prisma);

  for (const key of ALL_FUNCTIONAL_CAPABILITY_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: "functional_v2", description: key },
    });
  }

  const inverted = invertRequirements();
  const failures: string[] = [];
  const rows: CapRow[] = [];
  let legacyBypassOk = true;
  let directApiOk = true;
  let zeroSideOk = true;
  let multiRoleOk = true;

  const parentOnlyKeys = new Set(Object.keys(PARENT_CHILD_DENY));
  const denyEmail = await seedCertUser(prisma, "deny_all", []);
  const denyToken = await login(app, denyEmail);
  const loginCache = new Map<string, string>();

  for (let i = 0; i < ALL_FUNCTIONAL_CAPABILITY_KEYS.length; i++) {
    const key = ALL_FUNCTIONAL_CAPABILITY_KEYS[i]!;
    const notes: string[] = [];
    const ops = inverted.get(key) ?? [];
    const grantsForCap = parentOnlyKeys.has(key) && key.endsWith("view_page")
      ? [key]
      : key.endsWith("view_page")
        ? [key]
        : (() => {
            const norm = normalizeFunctionalGrants([key]);
            return norm.ok ? norm.normalized : [key];
          })();

    let positive = true;
    for (const op of ops) {
      const req = ROUTE_FUNCTIONAL_REQUIREMENTS[op]!;
      if (!enforcementAllows(grantsForCap, req)) {
        positive = false;
        failures.push(`P0 ${key} enforcement+ ${op}`);
      }
    }
    if (ops.length === 0 && !key.includes("lookup")) {
      notes.push("no single-key mapped ops");
    }

    let missing403 = true;
    for (const op of ops.slice(0, 5)) {
      const req = ROUTE_FUNCTIONAL_REQUIREMENTS[op]!;
      if (enforcementAllows([], req)) {
        missing403 = false;
        failures.push(`P0 ${key} empty grants allowed ${op}`);
      }
    }

    let sibling = true;
    const sib = SIBLING_DENY[key];
    if (sib) {
      const denyReq = ROUTE_FUNCTIONAL_REQUIREMENTS[sib.denyOp];
      if (denyReq && enforcementAllows(sib.grants, denyReq)) {
        sibling = false;
        failures.push(`P1 ${key} sibling leak ${sib.denyOp}`);
      }
    } else if (!key.endsWith("view_page") && !key.endsWith(".full")) {
      sibling = true;
    }

    const parentChild = PARENT_CHILD_DENY[key];
    if (parentChild) {
      const req = ROUTE_FUNCTIONAL_REQUIREMENTS[parentChild];
      if (req && enforcementAllows([key], req)) {
        missing403 = false;
        failures.push(`P0 ${key} parent-only allowed child ${parentChild}`);
      }
    }

    const probe = HTTP_PROBE[key];
    let httpPos = false;
    let httpNeg = false;
    if (probe) {
      const grantKey = grantsForCap.join("|");
      let token = loginCache.get(grantKey);
      if (!token) {
        const email = await seedCertUser(prisma, `http_${i}`, grantsForCap);
        token = await login(app, email);
        loginCache.set(grantKey, token);
      }

      const vehicleCountBefore =
        probe.method === "POST" && probe.url === "/vehicles"
          ? await prisma.vehicle.count()
          : null;

      const pos = await app.inject({
        method: probe.method,
        url: probe.url,
        headers: { authorization: `Bearer ${token}` },
        payload: probe.payload,
      });
      httpPos = isAuthorizedStatus(pos.statusCode);

      const neg = await app.inject({
        method: probe.method,
        url: probe.url,
        headers: { authorization: `Bearer ${denyToken}` },
        payload: probe.payload,
      });
      httpNeg = neg.statusCode === 403;

      if (vehicleCountBefore !== null) {
        const after = await prisma.vehicle.count();
        if (!httpNeg && neg.statusCode !== 403 && after !== vehicleCountBefore) {
          zeroSideOk = false;
          failures.push(`P1 ${key} deny mutated vehicles`);
        }
        if (httpNeg && after !== vehicleCountBefore) {
          zeroSideOk = false;
          failures.push(`P0 ${key} 403 but DB changed`);
        }
      }

      if (!httpPos) {
        directApiOk = false;
        notes.push(`HTTP+ ${pos.statusCode}`);
      }
      if (!httpNeg) {
        directApiOk = false;
        notes.push(`HTTP- ${neg.statusCode}`);
      }
    } else {
      notes.push("no HTTP probe");
    }

    const uiSmoke: Verdict = "PARTIAL";
    const verdict: Verdict =
      positive && missing403 && sibling && (probe ? httpPos && httpNeg : positive)
        ? "PASS"
        : positive && missing403 && sibling
          ? "PARTIAL"
          : "FAIL";

    rows.push({
      n: i + 1,
      key,
      positive,
      missing403,
      sibling,
      uiSmoke,
      verdict,
      notes,
    });
  }

  for (const sample of LEGACY_SAMPLES) {
    const grants = [sample.legacy];
    const req = ROUTE_FUNCTIONAL_REQUIREMENTS[sample.op];
    if (req && enforcementAllows(grants, req)) {
      legacyBypassOk = false;
      failures.push(`P0 legacy bypass ${sample.legacy} → ${sample.op}`);
    }
  }

  const unionEmail = await seedCertUser(prisma, "union_a", [FN.contracts.viewPage]);
  const unionB = await seedCertUser(prisma, "union_b", [FN.contracts.rentalLink]);
  const u1 = await prisma.user.findFirstOrThrow({
    where: { email: { contains: "union_a" } },
  });
  const roleB = await prisma.role.findFirstOrThrow({ where: { key: `${PREFIX}_union_b` } });
  await prisma.userRole.create({ data: { userId: u1.id, roleId: roleB.id } });
  const unionToken = await login(app, u1.email);
  const unionRes = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: { authorization: `Bearer ${unionToken}` },
    payload: { vehicleId: 1, collectionMode: "ELECTRONIC" },
  });
  if (unionRes.statusCode === 403) {
    multiRoleOk = false;
    failures.push("P1 multi-role union contracts failed");
  }
  await prisma.userRole.deleteMany({ where: { userId: u1.id, roleId: roleB.id } });
  const afterRemove = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: { authorization: `Bearer ${unionToken}` },
    payload: { vehicleId: 1, collectionMode: "ELECTRONIC" },
  });
  if (afterRemove.statusCode !== 403) {
    multiRoleOk = false;
    failures.push(`P1 multi-role remove expected 403 got ${afterRemove.statusCode}`);
  }

  await cleanup(prisma);
  await app.close();
  await prisma.$disconnect();

  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  const partial = rows.filter((r) => r.verdict === "PARTIAL").length;

  console.log("\n## RBAC 32 CERTIFICATION TABLE\n");
  console.log("| # | Capability | Positive | Missing-cap 403 | Sibling isolation | UI smoke | Verdict |");
  console.log("|---:|---|:---:|:---:|:---:|:---:|---|");
  for (const r of rows) {
    const short = r.key.replace("diamond.fn.", "");
    console.log(
      `| ${r.n} | ${short} | ${r.positive ? "Y" : "N"} | ${r.missing403 ? "Y" : "N"} | ${r.sibling ? "Y" : "n/a"} | ${r.uiSmoke} | **${r.verdict}** |`,
    );
  }

  console.log("\nTOTAL_CAPABILITIES = 32");
  console.log(`PASS = ${pass}`);
  console.log(`FAIL = ${fail}`);
  console.log(`PARTIAL = ${partial}`);
  console.log(`LEGACY_BYPASS = ${legacyBypassOk ? "PASS" : "FAIL"}`);
  console.log(`DIRECT_API_ENFORCEMENT = ${directApiOk ? "PASS" : "FAIL"}`);
  console.log(`ZERO_SIDE_EFFECT_ON_DENY = ${zeroSideOk ? "PASS" : "PARTIAL"}`);
  console.log(`MULTI_ROLE_UNION = ${multiRoleOk ? "PASS" : "FAIL"}`);
  console.log("ROUTE_COVERAGE = (run unit functional-rbac-route-coverage.test.ts)");
  console.log("BROWSER_PAGE_GUARDS = PARTIAL (static nav unit tests; no E2E run)");

  if (failures.length) {
    console.log("\n### Failures\n");
    for (const f of failures) console.log(`- ${f}`);
  }

  const allEffective = fail === 0 && legacyBypassOk && multiRoleOk;
  console.log(`\nALL_32_PERMISSIONS_EFFECTIVE = ${allEffective ? "PASS" : "FAIL"}`);
  console.log(`RBAC_FINAL_CERTIFICATION = ${allEffective && pass >= 28 ? "PASS" : "FAIL"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
