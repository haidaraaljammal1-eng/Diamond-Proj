import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/diamond?schema=public";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

try {
  const dbRow = await prisma.$queryRaw`SELECT current_database()::text AS db`;
  const rows = await prisma.$queryRaw`
    SELECT r.id, r.key, r.name,
      BOOL_OR(p.key = 'diamond.fn.contracts.delivery_return_reconcile') AS delivery,
      BOOL_OR(p.key = 'diamond.fn.contracts.collection_closure') AS collection,
      BOOL_OR(p.key = 'diamond.fn.users.edit') AS edit,
      BOOL_OR(p.key = 'diamond.fn.users.assign_roles') AS assign_roles
    FROM roles r
    LEFT JOIN role_permissions rp ON rp."roleId" = r.id
    LEFT JOIN permissions p ON p.id = rp."permissionId"
    GROUP BY r.id, r.key, r.name
    ORDER BY r.name`;

  function bucket(list, a, b) {
    const onlyA = [];
    const onlyB = [];
    const both = [];
    let neitherCount = 0;
    for (const r of list) {
      const entry = { id: Number(r.id), key: r.key, name: r.name };
      const ha = Boolean(r[a]);
      const hb = Boolean(r[b]);
      if (ha && !hb) onlyA.push(entry);
      else if (hb && !ha) onlyB.push(entry);
      else if (ha && hb) both.push(entry);
      else neitherCount += 1;
    }
    return { onlyA, onlyB, both, neitherCount };
  }

  const contracts = bucket(rows, "delivery", "collection");
  const users = bucket(rows, "edit", "assign_roles");

  console.log(
    JSON.stringify(
      {
        database: dbRow[0].db,
        contracts,
        users,
        stopIfSplit:
          contracts.onlyA.length > 0 ||
          contracts.onlyB.length > 0 ||
          users.onlyA.length > 0 ||
          users.onlyB.length > 0,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
