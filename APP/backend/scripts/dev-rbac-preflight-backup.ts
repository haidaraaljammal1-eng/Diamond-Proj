/**
 * Development RBAC preflight + JSON backup (read-only export, write backup file only).
 * Run: npx tsx scripts/dev-rbac-preflight-backup.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { SYSTEM_ROLES } from "src/constants/roles";
import { normalizeEmail } from "src/lib/security/normalize";

function assertDevelopmentEnvironment(): void {
  if (env.NODE_ENV === "production") {
    throw new Error("[preflight] refusing to run in production");
  }
  const url = env.DATABASE_URL.toLowerCase();
  const looksLocal =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("@host.docker.internal");
  if (!looksLocal) {
    throw new Error("[preflight] DATABASE_URL does not look like local development");
  }
}

async function main(): Promise<void> {
  assertDevelopmentEnvironment();
  const keepEmail = normalizeEmail(env.DEV_ADMIN_EMAIL);
  if (!keepEmail) throw new Error("DEV_ADMIN_EMAIL is not configured");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  const systemAdmin = await prisma.role.findUnique({
    where: { key: SYSTEM_ROLES.SYSTEM_ADMIN },
    include: {
      permissions: { include: { permission: true } },
      users: { include: { user: { select: { id: true, email: true, status: true } } } },
    },
  });
  const keeper = await prisma.user.findUnique({
    where: { email: keepEmail },
    include: { roles: { include: { role: { select: { key: true, isSystem: true } } } } },
  });

  const counts = {
    users: await prisma.user.count(),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    userRoles: await prisma.userRole.count(),
    rolePermissions: await prisma.rolePermission.count(),
  };

  const keeperHasSystemAdmin = Boolean(
    keeper?.roles.some((ur) => ur.role.key === SYSTEM_ROLES.SYSTEM_ADMIN),
  );

  if (!systemAdmin) throw new Error("system_admin role missing");
  if (!keeper) throw new Error(`DEV_ADMIN_EMAIL user not found: configured keeper missing`);
  if (!keeperHasSystemAdmin) {
    throw new Error(
      "Preflight BLOCKED: DEV_ADMIN_EMAIL user does not hold system_admin. Resolve before cleanup.",
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(
    process.env.USERPROFILE ?? process.cwd(),
    "Documents",
    "DIAMOND-SYSTEM-backups",
    `rbac-${stamp}`,
  );
  mkdirSync(backupDir, { recursive: true });

  const [users, roles, permissions, userRoles, rolePermissions] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, status: true, createdAt: true },
    }),
    prisma.role.findMany({
      select: { id: true, key: true, name: true, isSystem: true },
    }),
    prisma.permission.findMany({ select: { id: true, key: true, category: true } }),
    prisma.userRole.findMany({ select: { userId: true, roleId: true } }),
    prisma.rolePermission.findMany({ select: { roleId: true, permissionId: true } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    environment: env.NODE_ENV,
    database: env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@"),
    keeperEmailConfigured: keepEmail.replace(/(^.).*(@.*$)/, "$1***$2"),
    keeperUserId: keeper.id,
    counts,
    users,
    roles,
    permissions,
    userRoles,
    rolePermissions,
  };

  const outPath = join(backupDir, "rbac-snapshot.json");
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        status: "PREFLIGHT_OK",
        backupDir,
        backupFile: outPath,
        counts,
        keeperUserId: keeper.id,
        systemAdminRoleId: systemAdmin.id,
        keeperHasSystemAdmin,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
