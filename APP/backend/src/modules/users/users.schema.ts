import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { UserStatusSchema } from "src/lib/http/common-schemas";
import { MIN_PASSWORD_LENGTH } from "src/lib/security/password";

export const RoleSummarySchema = z.object({
  id: z.number().int(),
  key: z.string(),
  name: z.string(),
});

/** A branch this user belongs to (drives hard branch scoping). Primary first.
 *  DERIVED from the user's department memberships — never edited independently. */
export const UserBranchSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  isPrimary: z.boolean(),
});

/** A department this user belongs to — the ORGANIZATIONAL assignment source. The
 *  user's branch scope (`branches`) is derived from these. `branchId`/`branchName`
 *  are null only for legacy departments created before branch scoping. */
export const UserDepartmentSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  branchId: z.number().int().nullable(),
  branchName: z.string().nullable(),
  isManager: z.boolean(),
});

/** Public user representation. NEVER includes passwordHash. */
export const UserPublicSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string().nullable(),
  status: UserStatusSchema,
  roles: z.array(RoleSummarySchema),
  permissions: z.array(z.string()),
  /** Organizational assignment — the source of truth. */
  departments: z.array(UserDepartmentSummarySchema),
  /** Branch scope DERIVED from `departments`. Read-only in the normal user form. */
  branches: z.array(UserBranchSummarySchema),
  /** Whether the account has TOTP enrolled. The secret itself is never exposed. */
  twoFactorEnabled: z.boolean(),
  lastSeenAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const ListUsersQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  status: UserStatusSchema.optional(),
  sort: z.string().optional(),
});

export const CreateUserSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(200).optional(),
  roleIds: z.array(z.number().int().positive()).default([]),
  // ORGANIZATIONAL assignment (the normal path). The user's branch scope is DERIVED
  // from these departments' branches — the client never chooses branches directly.
  departmentIds: z.array(z.number().int().positive()).default([]),
  // Legacy branch fields — honored ONLY when `departmentIds` is empty (migration /
  // external callers). When `departmentIds` is provided these are IGNORED: branches
  // are derived server-side, never trusted from the client. `primaryBranchId` must
  // be one of `branchIds`; when omitted (or invalid) the first branch becomes primary.
  branchIds: z.array(z.number().int().positive()).default([]),
  primaryBranchId: z.number().int().positive().optional(),
  // OPTIONAL admin-set initial password (local password login). When provided the
  // account is created ACTIVE with NO account-setup token/email; when omitted the
  // existing account-setup invite flow is used unchanged. `confirmPassword` must
  // equal `password` — the match is enforced in the service (kept off the schema
  // so OpenAPI generation stays flat and other auth types remain unaffected). The
  // password is NEVER echoed back in the response.
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
  confirmPassword: z.string().optional(),
});

/** Whitelisted updatable fields only — never spread the raw body into Prisma. */
export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable(),
    email: z.email(),
  })
  .partial();

export const UpdateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const AssignRolesSchema = z.object({
  roleIds: z.array(z.number().int().positive()),
});

/** Replace a user's branch memberships. Empty array clears all branch scope.
 *  LEGACY endpoint — the normal form uses department assignment (branch derived). */
export const AssignBranchesSchema = z.object({
  branchIds: z.array(z.number().int().positive()).default([]),
  primaryBranchId: z.number().int().positive().optional(),
});

/** Replace a user's DEPARTMENT memberships — the organizational assignment source.
 *  The user's branch scope is re-derived and synchronized transactionally. An empty
 *  array clears all org assignment (deliberate admin action only). */
export const AssignDepartmentsSchema = z.object({
  departmentIds: z.array(z.number().int().positive()).default([]),
});

/** Contextual department picker for the user-assignment form. Minimal projection,
 *  branch-scoped departments only (a branch is required to derive scope). */
export const DepartmentOptionsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const DepartmentOptionSchema = z.object({
  departmentId: z.number().int(),
  departmentName: z.string(),
  branchId: z.number().int(),
  branchName: z.string(),
});

export const CreateUserResponseSchema = z.object({
  data: z.object({
    user: UserPublicSchema,
    // The account-setup invite. NULL when the admin set a password directly at
    // creation (nothing to hand off — the account is already usable).
    setup: z
      .object({
        token: z.string(),
        link: z.string(),
        expiresAt: z.date(),
      })
      .nullable(),
    email: z.object({ status: z.enum(["SENT", "SKIPPED", "FAILED"]) }),
  }),
});

/** Admin sets/resets a user's password directly. `confirmPassword` must equal
 *  `newPassword` (enforced in the service). Neither value is ever echoed back,
 *  logged, or stored in plaintext. Distinct from self-service reset (token-based)
 *  and from a user changing their own password (needs the current password). */
export const ResetUserPasswordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  confirmPassword: z.string(),
});
