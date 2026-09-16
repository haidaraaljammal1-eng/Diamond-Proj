/**
 * Development-only staff cleanup.
 *
 * Removes integration-test users from the local database and keeps the seeded
 * development admin (`DEV_ADMIN_EMAIL`). Does not change schema or user APIs.
 *
 * Run: npm run db:cleanup:dev-users
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { normalizeEmail } from "src/lib/security/normalize";

const TEST_EMAIL_PREFIXES = [
  "veh-",
  "uds-",
  "lp-",
  "op-",
  "md-",
  "ct-",
  "cl-",
  "imp-",
  "tpl-",
  "ns-",
  "int-",
  "dup-",
  "us-",
  "cmp-",
];

function assertDevelopmentEnvironment(): void {
  if (env.NODE_ENV === "production") {
    throw new Error("[cleanup:dev-users] refusing to run in production");
  }

  const url = env.DATABASE_URL.toLowerCase();
  const looksLocal =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("@host.docker.internal");

  if (!looksLocal) {
    throw new Error(
      "[cleanup:dev-users] DATABASE_URL does not look like a local development database",
    );
  }
}

function isIntegrationTestEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith("@example.test") || lower.endsWith("@ex.test")) return true;
  const local = lower.split("@")[0] ?? "";
  return TEST_EMAIL_PREFIXES.some((prefix) => local.startsWith(prefix));
}

function parseArgs(): { onlyAdmin: boolean } {
  return { onlyAdmin: process.argv.includes("--only-admin") };
}

async function detachUserReferences(
  prisma: PrismaClient,
  userId: number,
  adminId: number,
): Promise<void> {
  await prisma.contract.updateMany({
    where: { createdByUserId: userId },
    data: { createdByUserId: adminId },
  });
  await prisma.contract.updateMany({
    where: { assignedEmployeeUserId: userId },
    data: { assignedEmployeeUserId: null },
  });
  await prisma.contractCarOut.updateMany({
    where: { performedByUserId: userId },
    data: { performedByUserId: adminId },
  });
  await prisma.complaintAction.updateMany({
    where: { createdByUserId: userId },
    data: { createdByUserId: adminId },
  });
  await prisma.importJob.updateMany({
    where: { createdById: userId },
    data: { createdById: adminId },
  });
  await prisma.callSession.updateMany({
    where: { agentUserId: userId },
    data: { agentUserId: adminId },
  });
  await prisma.messageTemplate.updateMany({
    where: { createdById: userId },
    data: { createdById: adminId },
  });
  await prisma.branch.updateMany({
    where: { managerUserId: userId },
    data: { managerUserId: null },
  });
  await prisma.salesperson.updateMany({
    where: { userId },
    data: { userId: null },
  });
  await prisma.complaintRoutingRule.updateMany({
    where: { assignedToUserId: userId },
    data: { assignedToUserId: null },
  });
  await prisma.complaint.updateMany({
    where: { assignedToUserId: userId },
    data: { assignedToUserId: null },
  });
  await prisma.callCenterQueueItem.updateMany({
    where: { assignedToUserId: userId },
    data: { assignedToUserId: null },
  });
}

async function main(): Promise<void> {
  assertDevelopmentEnvironment();
  const { onlyAdmin } = parseArgs();

  const keepEmail = normalizeEmail(env.DEV_ADMIN_EMAIL);
  if (!keepEmail) {
    throw new Error("[cleanup:dev-users] DEV_ADMIN_EMAIL is not configured");
  }

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);
  const db = prisma as unknown as PrismaClient;

  try {
    const admin = await db.user.findUnique({
      where: { email: keepEmail },
      select: { id: true, email: true, name: true },
    });
    if (!admin) {
      throw new Error(
        `[cleanup:dev-users] development admin not found (${keepEmail}). Run db:seed first.`,
      );
    }

    const beforeCount = await db.user.count();
    const candidates = await db.user.findMany({
      where: { NOT: { id: admin.id } },
      select: { id: true, email: true, name: true },
      orderBy: { id: "asc" },
    });

    const toRemove = onlyAdmin
      ? candidates
      : candidates.filter((user) => isIntegrationTestEmail(user.email));
    const skipped = onlyAdmin
      ? []
      : candidates.filter((user) => !isIntegrationTestEmail(user.email));

    for (const user of toRemove) {
      await detachUserReferences(db, user.id, admin.id);
      await db.user.delete({ where: { id: user.id } });
    }

    const afterCount = await db.user.count();

    console.log(
      JSON.stringify(
        {
          environment: env.NODE_ENV,
          database: env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@"),
          keptAdmin: admin,
          mode: onlyAdmin ? "only-admin" : "test-users",
          before: { total: beforeCount },
          removed: {
            count: toRemove.length,
            users: toRemove,
          },
          skipped: {
            count: skipped.length,
            users: skipped,
          },
          after: { total: afterCount },
        },
        null,
        2,
      ),
    );

    console.log(
      `[cleanup:dev-users] done: kept ${keepEmail}, removed ${toRemove.length} test user(s), ${afterCount} user(s) remain.`,
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
