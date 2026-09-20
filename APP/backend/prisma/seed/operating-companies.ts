import type { PrismaClient } from "@prisma/client";

/**
 * The two Diamond operating companies. They are business master data, not demo
 * data: every Vehicle and every Contract references one, so both rows must exist
 * in every environment. `20260920012059_multi_company_foundation` inserts them so
 * the migration can backfill without a seed run; this seed converges on the same
 * rows by `code` and is safe to re-run.
 *
 * `isActive` is never overwritten here — deactivating a company is an operator
 * decision, and a re-seed must not silently reactivate it.
 */
export interface OperatingCompanySeedRow {
  code: string;
  displayName: string;
  legalNameAr: string;
  legalNameEn: string;
  /**
   * Brand accent for company identity in documents, lists and future invoices
   * and statements. No official brand hex was found in the repository or in
   * DOCU, so these are conservative placeholders: UNIQUE keeps the existing
   * Diamond gold (`--diamond-gold`, #C9A15C) and ELITE uses a muted slate blue
   * that stays distinguishable beside it. Replace both with the real brand
   * values when the companies provide them. This is never a status colour.
   */
  accentColor: string;
}

export const OPERATING_COMPANY_CODES = {
  UNIQUE: "UNIQUE",
  ELITE: "ELITE",
} as const;

export const OPERATING_COMPANIES: OperatingCompanySeedRow[] = [
  {
    code: OPERATING_COMPANY_CODES.UNIQUE,
    displayName: "UNIQUE",
    legalNameAr: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
    legalNameEn: "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
    accentColor: "#C9A15C",
  },
  {
    code: OPERATING_COMPANY_CODES.ELITE,
    displayName: "ELITE",
    legalNameAr: "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
    legalNameEn: "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
    accentColor: "#3E5C76",
  },
];

/** Upsert both companies by their stable `code`. */
export async function runOperatingCompanySeed(
  prisma: Pick<PrismaClient, "operatingCompany">,
): Promise<void> {
  for (const company of OPERATING_COMPANIES) {
    await prisma.operatingCompany.upsert({
      where: { code: company.code },
      update: {
        displayName: company.displayName,
        legalNameAr: company.legalNameAr,
        legalNameEn: company.legalNameEn,
        accentColor: company.accentColor,
      },
      create: company,
    });
  }
}

/** The company a seeded or backfilled fleet vehicle belongs to. */
export async function resolveSeedCompanyId(
  prisma: Pick<PrismaClient, "operatingCompany">,
  code: string = OPERATING_COMPANY_CODES.UNIQUE,
): Promise<number> {
  const company = await prisma.operatingCompany.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!company) throw new Error(`Operating company ${code} is missing — run the base seed first.`);
  return company.id;
}
