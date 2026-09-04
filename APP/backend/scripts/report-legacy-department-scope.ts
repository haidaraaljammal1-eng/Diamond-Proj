/**
 * Migration/backfill REPORT for department-driven branch assignment (read-only —
 * changes nothing). After Department became branch-scoped, two legacy shapes need an
 * admin's attention. This never guesses a department from a role (§24): it only lists.
 *
 *   1. Departments with no branch (branchId = null): created before branch scoping.
 *      They still work for historical complaints but cannot be assigned to a user
 *      (the user-assignment lookup hides them) — an admin should create branch-scoped
 *      replacements and deactivate these.
 *   2. Users with a branch assignment but NO department assignment: their access is
 *      preserved (branch scope untouched), but they are not yet on the new model.
 *      An admin should assign departments so their branch scope becomes derived.
 *
 * Run from the backend repo root:  npx tsx scripts/report-legacy-department-scope.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

async function main() {
  const legacyDepartments = await prisma.department.findMany({
    where: { branchId: null, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  const legacyUsers = await prisma.user.findMany({
    where: {
      branchAssignments: { some: {} },
      departmentAssignments: { none: {} },
    },
    select: {
      id: true,
      email: true,
      name: true,
      branchAssignments: { select: { branch: { select: { name: true } } } },
    },
    orderBy: { id: "asc" },
  });

  console.log("\n=== Legacy branch-less departments (not assignable to users) ===");
  if (legacyDepartments.length === 0) {
    console.log("  none — every active department has a branch.");
  } else {
    for (const d of legacyDepartments) {
      console.log(`  #${d.id}  ${d.name}  (${d.code})`);
    }
  }

  console.log("\n=== Users with branch access but no department (review for migration) ===");
  if (legacyUsers.length === 0) {
    console.log("  none — every branch-scoped user has at least one department.");
  } else {
    for (const u of legacyUsers) {
      const branches = u.branchAssignments.map((b) => b.branch.name).join(", ");
      console.log(`  #${u.id}  ${u.email}  branches: [${branches}]`);
    }
  }

  console.log(
    `\nSummary: ${legacyDepartments.length} branch-less department(s), ` +
      `${legacyUsers.length} user(s) awaiting department assignment.\n` +
      "No changes were made. Assign departments/branches via the admin UI to migrate.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
