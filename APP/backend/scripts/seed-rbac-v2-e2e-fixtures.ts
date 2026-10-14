/**
 * Seeds limited employee personas into RBAC_E2E_DATABASE_URL only.
 */
import dotenv from "dotenv";
import path from "node:path";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { assertRbacE2eDatabaseUrl } from "../tests/helpers/rbac-e2e-database";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const url = process.env.RBAC_E2E_DATABASE_URL ?? "";
if (!url) {
  console.error("RBAC_E2E_DATABASE_URL required");
  process.exit(1);
}
assertRbacE2eDatabaseUrl(url);
process.env.DATABASE_URL = url;

const RUN = process.env.RBAC_E2E_RUN_ID ?? Date.now().toString(36);

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function upsertRole(key: string, name: string, keys: string[]) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name },
      create: { key, name },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of keys) {
      const perm = await prisma.permission.upsert({
        where: { key: permKey },
        update: {},
        create: {
          key: permKey,
          category: permKey.includes(".") ? permKey.split(".")[0] : "functional_v2",
          description: permKey,
        },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    }
    return role;
  }

  async function upsertUser(email: string, password: string, roleId: number) {
    const canonical = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email: canonical },
      update: { status: "ACTIVE", passwordHash },
      create: { email: canonical, name: email, status: "ACTIVE", passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
    return user;
  }

  const vehViewRole = await upsertRole(
    `e2e_veh_view_${RUN}`,
    "E2E Vehicle Viewer",
    [FN.vehicles.viewPage],
  );
  await upsertUser(
    `e2e-veh-view-${RUN}@example.test`,
    "E2e-Veh-View-123!",
    vehViewRole.id,
  );

  const priceRole = await upsertRole(
    `e2e_price_${RUN}`,
    "E2E Price Editor",
    [FN.vehicles.viewPage, FN.vehicles.editPrices],
  );
  await upsertUser(
    `e2e-price-${RUN}@example.test`,
    "E2e-Price-123!",
    priceRole.id,
  );

  process.stdout.write(
    JSON.stringify({
      runId: RUN,
      limitedEmail: `e2e-veh-view-${RUN}@example.test`,
      limitedPassword: "E2e-Veh-View-123!",
      priceEmail: `e2e-price-${RUN}@example.test`,
      pricePassword: "E2e-Price-123!",
    }),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
