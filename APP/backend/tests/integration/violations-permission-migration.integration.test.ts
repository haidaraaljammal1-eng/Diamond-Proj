/**
 * Validates violations RBAC migration outcome on haidara_test only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const RUN = process.env.RUN_INTEGRATION === "true";
const MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../prisma/migrations/20261019140000_violations_permission_simplification/migration.sql",
  ),
  "utf8",
);

const VIOLATION_FN_KEYS = [
  FN.violations.viewPage,
  FN.violations.manualCollection,
  FN.violations.reviewDues,
  FN.violations.collectCharges,
];

function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  const devUrl = process.env.DATABASE_URL ?? "";
  const testUrl = explicit || devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(testUrl);
  return testUrl;
}

if (!RUN) {
  test("violations permission migration skipped (RUN_INTEGRATION=true)", { skip: true });
} else {
  describe("violations permission migration (haidara_test)", () => {
    const testDatabaseUrl = resolveTestDatabaseUrl();
    let prisma: import("@prisma/client").PrismaClient;

    before(async () => {
      assert.equal(extractPostgresDatabaseName(testDatabaseUrl), "haidara_test");
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
      process.env.DATABASE_URL = testDatabaseUrl;
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
      });
    });

    after(async () => {
      await prisma.$disconnect();
    });

    test("all four violations functional permissions exist after migration SQL", async () => {
      await prisma.$executeRawUnsafe(MIGRATION_SQL);
      await prisma.permission.upsert({
        where: { key: FN.violations.viewPage },
        update: {},
        create: {
          key: FN.violations.viewPage,
          category: "functional_v2",
          description: "RBAC V2 functional capability: diamond.fn.violations.view_page",
        },
      });
      const rows = await prisma.permission.findMany({
        where: { key: { in: [...VIOLATION_FN_KEYS] } },
        select: { key: true },
      });
      const found = new Set(rows.map((r) => r.key));
      for (const key of VIOLATION_FN_KEYS) {
        assert.ok(found.has(key), `missing permission row ${key}`);
      }
    });

    test("migration SQL is idempotent and preserves collect_charges role grants", async () => {
      const role = await prisma.role.create({
        data: { key: `vl_mig_${Date.now()}`, name: "VL Mig" },
      });
      const collect = await prisma.permission.upsert({
        where: { key: FN.violations.collectCharges },
        update: {},
        create: {
          key: FN.violations.collectCharges,
          category: "functional_v2",
          description: "test",
        },
      });
      const review = await prisma.permission.upsert({
        where: { key: FN.violations.reviewDues },
        update: {},
        create: {
          key: FN.violations.reviewDues,
          category: "functional_v2",
          description: "test",
        },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: collect.id },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: review.id },
      });

      await prisma.$executeRawUnsafe(MIGRATION_SQL);

      const keys = await prisma.permission.findMany({
        where: {
          key: {
            in: [FN.violations.collectCharges, FN.violations.reviewDues, FN.violations.manualCollection],
          },
        },
        select: { id: true, key: true },
      });
      assert.equal(keys.length, 3);

      const grants = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        include: { permission: { select: { key: true } } },
      });
      const grantKeys = new Set(grants.map((g) => g.permission.key));
      assert.ok(grantKeys.has(FN.violations.collectCharges));
      assert.ok(grantKeys.has(FN.violations.reviewDues));
      assert.ok(grantKeys.has(FN.violations.manualCollection));

      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
    });
  });
}
