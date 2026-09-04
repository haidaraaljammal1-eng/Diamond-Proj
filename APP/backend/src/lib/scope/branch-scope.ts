import type { PrismaClient } from "@prisma/client";
import type { AuthUser } from "src/lib/context/auth-context";
import { hasPermission } from "src/lib/context/auth-context";

/**
 * Branch visibility scope — the ONE way this codebase answers
 * "which branches may this viewer see?".
 *
 * The model (identical in every domain that scopes by branch):
 *   • the viewer holds `<domain>.view_all_branches`  → global, no filter at all
 *   • otherwise                                      → exactly the branch ids in
 *     `UserBranchAssignment` for that user
 *
 * CRITICAL: an empty assignment set matches NOTHING. It must never fall back to
 * "all" — a user who was granted a scoped read permission but never assigned to a
 * branch sees zero rows, not every row. `{ in: [] }` is a real, restrictive filter
 * in Prisma, which is what makes that safe by construction.
 *
 * NOTE (duplication, deliberate — not cleaned up in this pass): the same logic is
 * still hand-rolled in
 *   src/modules/call-center/call-center.service.ts            (resolveScope/inScope)
 *   src/modules/complaints/complaints.service.ts
 *   src/modules/reports/*
 * Those are working, well-tested code paths and were left alone on purpose. New and
 * changed code uses THIS module; the older copies should be migrated onto it later.
 */
export type BranchScope = { global: true } | { global: false; branchIds: number[] };

/** The narrow slice of the Prisma client this module needs (keeps it testable). */
type BranchAssignmentReader = Pick<PrismaClient, "userBranchAssignment">;

/**
 * Resolve a viewer's branch scope for one domain.
 *
 * @param viewAllPermission the domain's `*.view_all_branches` key. Holding it means
 *   "bypass branch scoping for this domain" — it is the ONLY way to become global.
 */
export async function resolveBranchScope(
  prisma: BranchAssignmentReader,
  auth: AuthUser,
  viewAllPermission: string,
): Promise<BranchScope> {
  if (hasPermission(auth, viewAllPermission)) return { global: true };
  const rows = await prisma.userBranchAssignment.findMany({
    where: { userId: auth.id },
    select: { branchId: true },
  });
  return { global: false, branchIds: rows.map((r) => r.branchId) };
}

/**
 * Resolve SEVERAL domains' scopes from ONE `userBranchAssignment` read.
 *
 * A page that scopes on more than one dimension (the customer timeline scopes on
 * customers + call_center + complaints) would otherwise issue one identical
 * assignment query per dimension. The assignment set does not vary by domain — only
 * the `view_all_branches` permission does — so it is read at most once, and not at
 * all when every requested domain is already global.
 *
 * @param permissions map of caller-chosen key → that domain's `*.view_all_branches`
 * @returns the same keys, each mapped to its resolved scope
 */
export async function resolveBranchScopes<K extends string>(
  prisma: BranchAssignmentReader,
  auth: AuthUser,
  permissions: Record<K, string>,
): Promise<Record<K, BranchScope>> {
  const entries = Object.entries(permissions) as [K, string][];
  const needsAssignments = entries.some(([, perm]) => !hasPermission(auth, perm));
  const branchIds = needsAssignments
    ? (
        await prisma.userBranchAssignment.findMany({
          where: { userId: auth.id },
          select: { branchId: true },
        })
      ).map((r) => r.branchId)
    : [];
  const out = {} as Record<K, BranchScope>;
  for (const [key, perm] of entries) {
    out[key] = hasPermission(auth, perm) ? { global: true } : { global: false, branchIds };
  }
  return out;
}

/**
 * The scope expressed as a Prisma `branchId` filter.
 * `undefined` = global (apply no filter); `{ in: [...] }` = restrict, where an empty
 * array deliberately matches nothing.
 */
export function branchFilter(scope: BranchScope): { in: number[] } | undefined {
  return scope.global ? undefined : { in: scope.branchIds };
}

/** Is a single (possibly null) branch id inside the scope? A null branch is only
 *  ever visible to a global viewer — it belongs to no branch, so no assignment can
 *  reach it. */
export function inBranchScope(scope: BranchScope, branchId: number | null): boolean {
  return scope.global ? true : branchId != null && scope.branchIds.includes(branchId);
}
