import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildIntegrationProcessEnv } from "../tests/helpers/integration-harness";

const env = buildIntegrationProcessEnv(process.env);
const url = env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contract_payment_allocations'
  `;
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'contract_payment_allocations'
  `;
  const renewalIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'contract_renewals'
  `;
  const uniqueRenewalPayment = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'contract_renewals'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%settledPaymentId%'
  `;
  process.stdout.write(
    JSON.stringify(
      {
        allocationTableExists: tables.length === 1,
        allocationIndexes: indexes.map((row) => row.indexname),
        renewalIndexes: renewalIndexes.map((row) => row.indexname),
        uniqueSettledPaymentIdConstraint: uniqueRenewalPayment.map((row) => row.conname),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
