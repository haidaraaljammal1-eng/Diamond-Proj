import type { PrismaClient } from "@prisma/client";
import { OPERATING_COMPANIES } from "prisma/seed/operating-companies";

/**
 * Test access to the seeded operating companies.
 *
 * Every Vehicle and Contract needs a company, so fixtures resolve a real one
 * instead of inventing an id. The companies are upserted by `code`, so this is
 * safe to call from any test against a database where the base seed may or may
 * not have run.
 */
export type CompanyCode = "UNIQUE" | "ELITE";

export async function ensureOperatingCompanies(prisma: PrismaClient): Promise<void> {
  for (const company of OPERATING_COMPANIES) {
    await prisma.operatingCompany.upsert({
      where: { code: company.code },
      update: {},
      create: company,
    });
  }
}

/** Resolves (and seeds if missing) one company id, e.g. for a fixture vehicle. */
export async function companyId(
  prisma: PrismaClient,
  code: CompanyCode = "UNIQUE",
): Promise<number> {
  await ensureOperatingCompanies(prisma);
  const company = await prisma.operatingCompany.findUniqueOrThrow({
    where: { code },
    select: { id: true },
  });
  return company.id;
}
