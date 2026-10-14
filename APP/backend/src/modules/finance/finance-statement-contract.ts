import type { FinancialLedgerKind } from "@prisma/client";
import { COLLECTION_LEDGER_KINDS } from "src/modules/finance/finance.constants";

export type StatementContractResolution =
  | { ok: true; contractNumber: string | null }
  | { ok: false; reason: "missing_contract_id" | "contract_not_found" | "company_mismatch" };

/**
 * Authoritative contract number for a statement line from persisted ledger.contractId only.
 */
export function resolveStatementContractNumber(
  kind: FinancialLedgerKind,
  contractId: string | null,
  contract: { contractNumber: string; companyId: number } | undefined,
  statementCompanyId: number,
): StatementContractResolution {
  const requiresContract = (COLLECTION_LEDGER_KINDS as readonly FinancialLedgerKind[]).includes(kind);

  if (!requiresContract) {
    if (!contractId) return { ok: true, contractNumber: null };
    if (!contract?.contractNumber) return { ok: true, contractNumber: null };
    return { ok: true, contractNumber: contract.contractNumber };
  }

  if (!contractId) return { ok: false, reason: "missing_contract_id" };
  if (!contract?.contractNumber) return { ok: false, reason: "contract_not_found" };
  if (contract.companyId !== statementCompanyId) {
    return { ok: false, reason: "company_mismatch" };
  }
  return { ok: true, contractNumber: contract.contractNumber };
}
