import type { Prisma } from "@prisma/client";
import { financeCompanyScopeConflictError } from "src/modules/finance/finance.errors";

/**
 * Finance company scope: UNIQUE / ELITE / GENERAL / ALL.
 *
 * Diamond has exactly two operating companies. GENERAL is **not** a third one —
 * it is the absence of an authoritative company (`companyId IS NULL`), which a
 * vehicle-less Manual Expense produces. It therefore travels as its own scope
 * flag and never as a fake company id.
 *
 * ALL deliberately means "no company predicate at all", so it includes GENERAL.
 * It must never be expressed as `companyId IS NOT NULL`.
 */
export interface FinanceCompanyScopeQuery {
  companyId?: number;
  companyScope?: "ALL" | "GENERAL";
}

export type FinanceCompanyScope =
  | { kind: "ALL" }
  | { kind: "COMPANY"; companyId: number }
  | { kind: "GENERAL" };

export function resolveFinanceCompanyScope(query: FinanceCompanyScopeQuery): FinanceCompanyScope {
  if (query.companyScope === "GENERAL") {
    if (query.companyId != null) throw financeCompanyScopeConflictError();
    return { kind: "GENERAL" };
  }
  if (query.companyId != null) return { kind: "COMPANY", companyId: query.companyId };
  return { kind: "ALL" };
}

/** Predicate for a table that PERSISTS its own `companyId` (ledger, manual expenses). */
export function companyScopeWhere(scope: FinanceCompanyScope): { companyId?: number | null } {
  if (scope.kind === "GENERAL") return { companyId: null };
  if (scope.kind === "COMPANY") return { companyId: scope.companyId };
  return {};
}

/**
 * Predicate for a projection that DERIVES its company from a Contract relation
 * (receivables). Contracts always carry a company, so GENERAL matches nothing:
 * callers short-circuit on `scope.kind === "GENERAL"` rather than querying.
 */
export function contractCompanyScopeWhere(
  scope: FinanceCompanyScope,
): Prisma.ContractWhereInput | undefined {
  if (scope.kind === "COMPANY") return { companyId: scope.companyId };
  return undefined;
}
