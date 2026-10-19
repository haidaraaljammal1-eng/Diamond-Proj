import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/diamond?schema=public";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

const MERGED = [
  "diamond.fn.contracts.operations_closure",
  "diamond.fn.users.edit",
];
const RETIRED = [
  "diamond.fn.contracts.delivery_return_reconcile",
  "diamond.fn.contracts.collection_closure",
  "diamond.fn.users.assign_roles",
];

try {
  const db = (await prisma.$queryRaw`SELECT current_database()::text AS db`)[0].db;
  const fnCount = await prisma.permission.count({
    where: { key: { startsWith: "diamond.fn." } },
  });
  const retired = await prisma.permission.findMany({
    where: { key: { in: RETIRED } },
    select: { key: true },
  });
  const mergedRoles = await prisma.$queryRaw`
    SELECT r.key, array_agg(p.key ORDER BY p.key) AS keys
    FROM roles r
    JOIN role_permissions rp ON rp."roleId" = r.id
    JOIN permissions p ON p.id = rp."permissionId"
    WHERE p.key = 'diamond.fn.contracts.operations_closure'
    GROUP BY r.id, r.key
    ORDER BY r.key`;
  console.log(
    JSON.stringify(
      {
        database: db,
        functionalCapabilityCountInDb: fnCount,
        retiredKeysStillPresent: retired.map((r) => r.key),
        rolesWithOperationsClosure: mergedRoles,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
