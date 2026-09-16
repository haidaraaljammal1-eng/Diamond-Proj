/**
 * Development-only roles cleanup.
 *
 * Removes integration-test roles from the local database and keeps the seeded
 * system role (`system_admin`). Does not change schema or role APIs.
 *
 * Run: npm run db:cleanup:dev-roles
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { SYSTEM_ROLES } from "src/constants/roles";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";

const TEST_ROLE_KEY_PREFIXES = [
  "veh_",
  "uds_",
  "lp_",
  "op_",
  "md_",
  "ct_",
  "cl_",
  "imp_",
  "tpl_",
  "ns_",
  "int_",
  "cmp_",
  "us_",
];

function assertDevelopmentEnvironment(): void {
  if (env.NODE_ENV === "production") {
    throw new Error("[cleanup:dev-roles] refusing to run in production");
  }

  const url = env.DATABASE_URL.toLowerCase();
  const looksLocal =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("@host.docker.internal");

  if (!looksLocal) {
    throw new Error(
      "[cleanup:dev-roles] DATABASE_URL does not look like a local development database",
    );
  }
}

function isIntegrationTestRoleKey(key: string): boolean {
  const lower = key.toLowerCase();
  return TEST_ROLE_KEY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function parseArgs(): { onlySystemAdmin: boolean } {
  return { onlySystemAdmin: process.argv.includes("--only-system-admin") };
}

async function main(): Promise<void> {
  assertDevelopmentEnvironment();
  const { onlySystemAdmin } = parseArgs();

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);
  const db = prisma as unknown as PrismaClient;

  try {
    const systemAdmin = await db.role.findUnique({
      where: { key: SYSTEM_ROLES.SYSTEM_ADMIN },
      select: { id: true, key: true, name: true, isSystem: true },
    });
    if (!systemAdmin) {
      throw new Error(
        `[cleanup:dev-roles] system role not found (${SYSTEM_ROLES.SYSTEM_ADMIN}). Run db:seed first.`,
      );
    }

    const beforeCount = await db.role.count();
    const candidates = await db.role.findMany({
      where: { NOT: { id: systemAdmin.id } },
      select: { id: true, key: true, name: true, isSystem: true },
      orderBy: { id: "asc" },
    });

    const toRemove = onlySystemAdmin
      ? candidates
      : candidates.filter((role) => !role.isSystem && isIntegrationTestRoleKey(role.key));
    const skipped = onlySystemAdmin
      ? []
      : candidates.filter((role) => role.isSystem || !isIntegrationTestRoleKey(role.key));

    for (const role of toRemove) {
      if (role.isSystem) continue;
      await db.role.delete({ where: { id: role.id } });
    }

    const afterCount = await db.role.count();

    console.log(
      JSON.stringify(
        {
          environment: env.NODE_ENV,
          database: env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@"),
          keptRole: systemAdmin,
          mode: onlySystemAdmin ? "only-system-admin" : "test-roles",
          before: { total: beforeCount },
          removed: {
            count: toRemove.length,
            roles: toRemove,
          },
          skipped: {
            count: skipped.length,
            roles: skipped,
          },
          after: { total: afterCount },
        },
        null,
        2,
      ),
    );

    console.log(
      `[cleanup:dev-roles] done: kept ${SYSTEM_ROLES.SYSTEM_ADMIN}, removed ${toRemove.length} role(s), ${afterCount} role(s) remain.`,
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
