import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeEmail } from "src/lib/security/normalize";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = normalizeEmail("qa-renewal-visual-20261013@example.test");
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
    },
  });
  const keys =
    user?.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)) ?? [];
  console.log(JSON.stringify({ email, keys: [...new Set(keys)].sort() }, null, 2));
  await prisma.$disconnect();
}
main();
