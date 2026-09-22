import type { PrismaClient } from "@prisma/client";
import { tarsError } from "src/modules/integrations/tars/tars.errors";
import { createTarsProvider } from "src/modules/integrations/tars/tars.provider";
import { getTarsCompanyConfig } from "src/modules/integrations/tars/tars.config";
import type { TarsCompanyRef, TarsProvider } from "src/modules/integrations/tars/tars.types";

export interface TarsContractContext {
  contractId: string;
  company: TarsCompanyRef;
  provider: TarsProvider;
}

/**
 * Resolves the TARS provider exclusively from `Contract.company`.
 * Never reads Vehicle company, frontend input, or page filters.
 */
export async function resolveTarsContractContext(
  prisma: PrismaClient,
  contractId: string,
): Promise<TarsContractContext> {
  const row = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      company: { select: { id: true, code: true } },
    },
  });
  if (!row) throw tarsError.contractNotFound();

  const company: TarsCompanyRef = {
    companyId: row.company.id,
    companyCode: row.company.code,
  };
  const provider = createTarsProvider(company.companyCode);
  if (provider.companyCode !== company.companyCode) {
    throw tarsError.providerCompanyMismatch();
  }

  return { contractId: row.id, company, provider };
}

/** Rejects stored integration metadata that belongs to a different provider/company. */
export function assertIntegrationCompanyMatch(
  contractCompanyCode: string,
  storedProvider: string | null | undefined,
): void {
  if (!storedProvider || storedProvider === "none" || storedProvider === "fake") return;
  if (storedProvider.toLowerCase() !== contractCompanyCode.toLowerCase()) {
    throw tarsError.externalIdCompanyMismatch();
  }
}

export function isTarsEnabledForCompany(companyCode: string): boolean {
  return getTarsCompanyConfig(companyCode).enabled;
}
