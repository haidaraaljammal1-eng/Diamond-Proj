/**
 * Finance company classification verification (Phase C1).
 *
 * Read-only. Safe before and after `20260921090000_finance_company_classification`:
 * it detects whether the two `companyId` columns exist and reports the source
 * counts either way, so the same command produces the before/after evidence.
 *
 * Run: npm run verify:finance-company
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";

type Row = Record<string, unknown>;

function count(rows: Row[]): number {
  return Number((rows[0]?.count as string | number | undefined) ?? 0);
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const columns = await prisma.$queryRaw<Row[]>`
      SELECT table_name, is_nullable
      FROM information_schema.columns
      WHERE table_name IN ('manual_expenses', 'financial_ledger_entries')
        AND column_name = 'companyId'
    `;
    const applied = columns.length === 2;

    console.log(`database: ${env.DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);
    console.log(`migration applied: ${applied ? "yes" : "no"}`);
    for (const column of columns) {
      console.log(`  ${String(column.table_name)}.companyId nullable: ${String(column.is_nullable)}`);
    }

    const companies = await prisma.operatingCompany.findMany({
      select: { id: true, code: true },
      orderBy: { id: "asc" },
    });
    console.log(`operating companies: ${companies.length} (${companies.map((c) => c.code).join(", ")})`);
    const unexpected = companies.filter((c) => c.code !== "UNIQUE" && c.code !== "ELITE");
    if (unexpected.length > 0) {
      throw new Error(`unexpected operating company row(s): ${unexpected.map((c) => c.code).join(", ")}`);
    }

    // ---- Manual expenses -------------------------------------------------
    const meTotal = count(await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "manual_expenses"`);
    const meWithVehicle = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "manual_expenses" WHERE "vehicleId" IS NOT NULL`,
    );
    console.log("\nmanual expenses");
    console.log(`  total: ${meTotal}`);
    console.log(`  with vehicle: ${meWithVehicle}`);
    console.log(`  without vehicle (GENERAL): ${meTotal - meWithVehicle}`);

    // ---- Ledger ----------------------------------------------------------
    const ledgerTotal = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "financial_ledger_entries"`,
    );
    const byContract = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "financial_ledger_entries" WHERE "contractId" IS NOT NULL`,
    );
    const byManual = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "financial_ledger_entries" WHERE "contractId" IS NULL AND "manualExpenseId" IS NOT NULL`,
    );
    const byMaintenance = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "financial_ledger_entries" WHERE "contractId" IS NULL AND "manualExpenseId" IS NULL AND "maintenanceOrderId" IS NOT NULL`,
    );
    const byVehicleOnly = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "financial_ledger_entries" WHERE "contractId" IS NULL AND "manualExpenseId" IS NULL AND "maintenanceOrderId" IS NULL AND "vehicleId" IS NOT NULL`,
    );
    console.log("\nledger");
    console.log(`  total: ${ledgerTotal}`);
    console.log(`  resolvable by contract: ${byContract}`);
    console.log(`  resolvable by manual expense: ${byManual}`);
    console.log(`  resolvable by maintenance: ${byMaintenance}`);
    console.log(`  resolvable by vehicle only: ${byVehicleOnly}`);
    console.log(
      `  no authoritative source: ${ledgerTotal - byContract - byManual - byMaintenance - byVehicleOnly}`,
    );

    if (!applied) {
      console.log("\n(pre-migration snapshot — no companyId column yet)");
      return;
    }

    // ---- Post-migration assertions --------------------------------------
    const meVehicleWithoutCompany = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "manual_expenses" WHERE "vehicleId" IS NOT NULL AND "companyId" IS NULL`,
    );
    const meMismatch = count(
      await prisma.$queryRaw<Row[]>`
        SELECT COUNT(*)::int AS count
        FROM "manual_expenses" me
        JOIN "vehicles" v ON v."id" = me."vehicleId"
        WHERE me."companyId" IS DISTINCT FROM v."companyId"
      `,
    );
    const meGeneral = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "manual_expenses" WHERE "companyId" IS NULL`,
    );
    const ledgerContractMismatch = count(
      await prisma.$queryRaw<Row[]>`
        SELECT COUNT(*)::int AS count
        FROM "financial_ledger_entries" fle
        JOIN "contracts" c ON c."id" = fle."contractId"
        WHERE fle."companyId" IS DISTINCT FROM c."companyId"
      `,
    );
    const ledgerManualMismatch = count(
      await prisma.$queryRaw<Row[]>`
        SELECT COUNT(*)::int AS count
        FROM "financial_ledger_entries" fle
        JOIN "manual_expenses" me ON me."id" = fle."manualExpenseId"
        WHERE fle."companyId" IS DISTINCT FROM me."companyId"
      `,
    );
    const ledgerGeneral = count(
      await prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS count FROM "financial_ledger_entries" WHERE "companyId" IS NULL`,
    );

    console.log("\nafter migration");
    console.log(`  manual expenses classified GENERAL (null): ${meGeneral}`);
    console.log(`  vehicle-linked manual expenses still null: ${meVehicleWithoutCompany}`);
    console.log(`  manual expense vs vehicle mismatches: ${meMismatch}`);
    console.log(`  ledger rows classified GENERAL/unresolved (null): ${ledgerGeneral}`);
    console.log(`  ledger vs contract mismatches: ${ledgerContractMismatch}`);
    console.log(`  ledger vs manual expense mismatches: ${ledgerManualMismatch}`);

    const failures: string[] = [];
    if (meVehicleWithoutCompany > 0) failures.push("vehicle-linked manual expense without a company");
    if (meMismatch > 0) failures.push("manual expense company differs from its vehicle");
    if (ledgerContractMismatch > 0) failures.push("ledger company differs from its contract");
    if (ledgerManualMismatch > 0) failures.push("ledger company differs from its manual expense");
    if (columns.some((column) => column.is_nullable !== "YES")) failures.push("companyId is NOT NULL");
    if (failures.length > 0) {
      throw new Error(`verification failed: ${failures.join("; ")}`);
    }
    console.log("\nOK");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
