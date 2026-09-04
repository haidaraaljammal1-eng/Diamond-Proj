import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { AppError } from "src/lib/errors/app-error";
import type { BranchScope } from "src/lib/scope/branch-scope";
import { resolveBranchScope } from "src/lib/scope/branch-scope";

/**
 * CUSTOMER BRANCH VISIBILITY — the single definition, used by every customer read.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * `Customer` has NO `branchId` column: a customer is not owned by a branch, it is
 * REACHED through one. A customer's branches are exactly the branches of its
 * `PurchaseExperience` rows (a customer may legitimately span several).
 *
 * Therefore:
 *
 *   A customer is visible to a viewer IFF
 *     • the viewer holds `customers.view_all_branches`               (global), OR
 *     • the customer has AT LEAST ONE PurchaseExperience whose
 *       `branchId` is in the viewer's UserBranchAssignment set.
 *
 * Consequences, stated explicitly because they are load-bearing:
 *   • A branch-scoped viewer with NO branch assignments sees NOTHING. `{ in: [] }`
 *     is a real filter; there is no fallback to "all".
 *   • A customer with NO purchase experiences at all belongs to no branch and is
 *     therefore visible ONLY to a global viewer. Prospects/imports created before
 *     their first sale need `customers.view_all_branches` to be seen — that is the
 *     honest reading of "reached through a branch", not an oversight.
 *   • Visibility is per-CUSTOMER, never per-experience: once the customer is in
 *     scope the whole customer record is, including experiences at other branches.
 *     Splitting a single customer record across branches would produce a customer
 *     360 that contradicts itself.
 *
 * ── WHY IT LIVES HERE ───────────────────────────────────────────────────────
 * `listCustomers`, `getCustomer`, `customer360` and the communication timeline all
 * import from this module and share ONE where-fragment / ONE gate. They cannot
 * drift: a customer can never be listed in one place and 404 in another, and a
 * customer that 404s can never have its timeline read.
 */

/** Resolve the viewer's customer-dimension branch scope. */
export function resolveCustomerScope(
  prisma: Pick<PrismaClient, "userBranchAssignment">,
  auth: AuthUser,
): Promise<BranchScope> {
  return resolveBranchScope(prisma, auth, PERMISSIONS.CUSTOMERS_VIEW_ALL_BRANCHES);
}

/**
 * The rule as a Prisma `CustomerWhereInput` fragment — the ONE place it is encoded.
 * `{}` for a global viewer (no restriction); otherwise "has some experience in my
 * branches", which for an empty branch set is `{ in: [] }` → matches no customer.
 */
export function customerScopeWhere(scope: BranchScope): Prisma.CustomerWhereInput {
  if (scope.global) return {};
  return { experiences: { some: { branchId: { in: scope.branchIds } } } };
}

/**
 * Entry gate for the single-customer reads.
 *
 * Throws the module's ordinary NOT-FOUND on an out-of-scope customer — deliberately
 * NOT a 403. A 403 would confirm that a customer with this id exists at another
 * branch, which is itself a leak (enumerating ids would map the whole customer
 * base). "Not found" and "not yours" must be indistinguishable from outside.
 */
export async function assertCustomerVisible(
  prisma: Pick<PrismaClient, "customer" | "userBranchAssignment">,
  customerId: number,
  auth: AuthUser,
): Promise<void> {
  return assertCustomerInScope(prisma, customerId, await resolveCustomerScope(prisma, auth));
}

/** Same gate, for callers that already resolved the scope (so the assignment read
 *  is not repeated). ONE customer query — existence and visibility together, never
 *  a load-then-check that could diverge. */
export async function assertCustomerInScope(
  prisma: Pick<PrismaClient, "customer">,
  customerId: number,
  scope: BranchScope,
): Promise<void> {
  const found = await prisma.customer.findFirst({
    where: { id: customerId, ...customerScopeWhere(scope) },
    select: { id: true },
  });
  if (!found) throw AppError.notFound("Customer not found");
}
