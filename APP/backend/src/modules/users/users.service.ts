import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { env } from "src/config/env";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { SYSTEM_ROLES } from "src/constants/roles";
import { normalizeEmail } from "src/lib/security/normalize";
import { hashPassword, validatePasswordStrength } from "src/lib/security/password";
import { expiryFromNow, generateOpaqueToken, hashToken } from "src/lib/security/tokens";
import { withTransaction } from "src/lib/db/transaction";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { paginate, parseSort } from "src/lib/http/pagination";
import { toUserPublic, userWithRolesInclude } from "src/modules/users/users.mapper";
import type {
  AssignBranchesSchema,
  AssignDepartmentsSchema,
  AssignRolesSchema,
  CreateUserSchema,
  DepartmentOptionsQuerySchema,
  ListUsersQuerySchema,
  ResetUserPasswordSchema,
  UpdateUserSchema,
} from "src/modules/users/users.schema";
import type { z } from "zod";

const SORTABLE = ["email", "name", "createdAt", "status"] as const;

export function createUsersService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function assertNotRemovingLastAdmin(
    client: Prisma.TransactionClient | typeof prisma,
    userId: number,
    willRemainAdmin: boolean,
  ) {
    const adminRole = await client.role.findUnique({
      where: { key: SYSTEM_ROLES.SYSTEM_ADMIN },
      select: { id: true },
    });
    if (!adminRole) return;
    const isCurrentlyAdmin = await client.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: adminRole.id } },
    });
    if (!isCurrentlyAdmin || willRemainAdmin) return;
    const otherAdmins = await client.userRole.count({
      where: { roleId: adminRole.id, userId: { not: userId } },
    });
    if (otherAdmins === 0) {
      throw new AppError({
        code: ErrorCode.CONFLICT,
        message: "Cannot remove the last administrator",
      });
    }
  }

  // Validate that every branch id exists and resolve which one is primary
  // (the requested primary if it's in the set, otherwise the first). Returns the
  // `UserBranchAssignment` row data (userId is added by the caller). Empty in → empty out.
  async function resolveBranchRows(
    client: Prisma.TransactionClient | typeof prisma,
    branchIds: number[],
    primaryBranchId?: number,
  ): Promise<{ branchId: number; isPrimary: boolean }[]> {
    const ids = [...new Set(branchIds)];
    if (ids.length === 0) return [];
    const found = await client.branch.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw AppError.validation("Branch not found");
    const primary =
      primaryBranchId && ids.includes(primaryBranchId) ? primaryBranchId : ids[0];
    return ids.map((branchId) => ({ branchId, isPrimary: branchId === primary }));
  }

  // Organizational assignment derivation: validate the selected departments and
  // compute BOTH the department rows and the DERIVED, de-duplicated branch rows.
  // Every selected department must exist, be active, and have a branch — legacy
  // null-branch departments are not assignable here because a user's branch scope
  // must be derivable (§10: the client never chooses branches). The primary branch
  // is preserved if it is still among the derived set, otherwise the first.
  async function resolveDepartmentsAndBranches(
    client: Prisma.TransactionClient | typeof prisma,
    departmentIds: number[],
    existingPrimaryBranchId?: number,
  ): Promise<{
    deptRows: { departmentId: number }[];
    branchRows: { branchId: number; isPrimary: boolean }[];
  }> {
    const ids = [...new Set(departmentIds)];
    if (ids.length === 0) return { deptRows: [], branchRows: [] };
    const departments = await client.department.findMany({
      where: { id: { in: ids } },
      select: { id: true, isActive: true, branchId: true },
    });
    if (departments.length !== ids.length) throw AppError.validation("Department not found");
    if (departments.some((d) => !d.isActive)) {
      throw AppError.validation("Department is inactive");
    }
    if (departments.some((d) => d.branchId == null)) {
      throw AppError.validation("Department has no branch and cannot be assigned");
    }
    const branchIds = [...new Set(departments.map((d) => d.branchId as number))];
    const primary =
      existingPrimaryBranchId && branchIds.includes(existingPrimaryBranchId)
        ? existingPrimaryBranchId
        : branchIds[0];
    return {
      deptRows: ids.map((departmentId) => ({ departmentId })),
      branchRows: branchIds.map((branchId) => ({ branchId, isPrimary: branchId === primary })),
    };
  }

  async function list(query: z.infer<typeof ListUsersQuerySchema>) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { field, direction } = parseSort(query.sort, SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });

    const result = await paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.user.count({ where }),
      findMany: (skip, take) =>
        prisma.user.findMany({
          where,
          include: userWithRolesInclude,
          orderBy: { [field]: direction } as Prisma.UserOrderByWithRelationInput,
          skip,
          take,
        }),
    });
    return { data: result.data.map(toUserPublic), meta: result.meta };
  }

  async function get(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: userWithRolesInclude,
    });
    if (!user) throw AppError.notFound("User not found");
    return toUserPublic(user);
  }

  async function create(input: z.infer<typeof CreateUserSchema>) {
    const email = normalizeEmail(input.email);
    const roleIds = [...new Set(input.roleIds)];
    if (roleIds.length > 0) {
      const found = await prisma.role.count({ where: { id: { in: roleIds } } });
      if (found !== roleIds.length) throw AppError.validation("Role not found");
    }
    // Departments are the organizational source of truth: when provided, the branch
    // scope is DERIVED from them and any client-sent branchIds are ignored (§10).
    // The legacy explicit-branch path is kept only for callers that send no
    // departments (migration / external systems).
    const { deptRows, branchRows } =
      input.departmentIds.length > 0
        ? await resolveDepartmentsAndBranches(prisma, input.departmentIds)
        : {
            deptRows: [] as { departmentId: number }[],
            branchRows: await resolveBranchRows(prisma, input.branchIds, input.primaryBranchId),
          };

    // Two mutually-exclusive activation paths:
    //  • admin set a password  → create ACTIVE with a passwordHash, no invite;
    //  • no password           → create PENDING + issue an account-setup token.
    const wantsPassword = Boolean(input.password);
    if (wantsPassword) {
      if (input.password !== input.confirmPassword) {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Password confirmation does not match",
        });
      }
      const strength = validatePasswordStrength(input.password as string);
      if (!strength.valid) {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Password does not meet the minimum requirements",
        });
      }
    }
    const passwordHash = wantsPassword ? await hashPassword(input.password as string) : null;

    const setupToken = wantsPassword ? null : generateOpaqueToken();
    const expiresAt = wantsPassword ? null : expiryFromNow(env.ACCOUNT_SETUP_TOKEN_TTL);

    let userId: number;
    try {
      userId = await withTransaction(prisma, async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            name: input.name,
            status: wantsPassword ? "ACTIVE" : "PENDING",
            ...(passwordHash ? { passwordHash } : {}),
            roles: { create: roleIds.map((roleId) => ({ roleId })) },
            departmentAssignments: { create: deptRows },
            branchAssignments: { create: branchRows },
          },
        });
        if (setupToken && expiresAt) {
          await tx.securityToken.create({
            data: {
              userId: created.id,
              tokenHash: hashToken(setupToken),
              scope: "ACCOUNT_SETUP",
              expiresAt,
            },
          });
        }
        return created.id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw AppError.conflict("Email already in use");
      throw err;
    }

    // Password path: the account is already usable — no invite, no email.
    if (wantsPassword) {
      const full = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: userWithRolesInclude,
      });
      return {
        user: toUserPublic(full),
        setup: null,
        email: { status: "SKIPPED" as const },
      };
    }

    const link = `${env.FRONTEND_URL}/account-setup?token=${setupToken}`;
    const emailResult = await fastify.mailer.send({
      to: email,
      template: "account_setup",
      vars: { name: input.name ?? email, link },
    });

    const full = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: userWithRolesInclude,
    });

    return {
      user: toUserPublic(full),
      // The single-use setup token is returned to the authorized creator so the
      // flow works even when email delivery is disabled. It is never stored raw.
      setup: { token: setupToken as string, link, expiresAt: expiresAt as Date },
      email: { status: emailResult.status },
    };
  }

  async function update(id: number, input: z.infer<typeof UpdateUserSchema>) {
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = normalizeEmail(input.email);

    try {
      const user = await prisma.user.update({
        where: { id },
        data,
        include: userWithRolesInclude,
      });
      return toUserPublic(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw AppError.conflict("Email already in use");
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw AppError.notFound("User not found");
      }
      throw err;
    }
  }

  // Admin sets/resets a user's password directly (NOT the token-based self-service
  // flow). The confirmation match and strength are validated here as defense-in-
  // depth even though the client validates too. The new hash and the session
  // revocation happen in ONE transaction: a reset done on security suspicion must
  // not leave an old session/refresh token alive (§10). The password is never
  // returned, logged, or stored in plaintext.
  async function setPassword(id: number, input: z.infer<typeof ResetUserPasswordSchema>) {
    if (input.newPassword !== input.confirmPassword) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Password confirmation does not match",
      });
    }
    const strength = validatePasswordStrength(input.newPassword);
    if (!strength.valid) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Password does not meet the minimum requirements",
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw AppError.notFound("User not found");

    const passwordHash = await hashPassword(input.newPassword);
    const user = await withTransaction(prisma, async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          // A PENDING account (invite never completed) becomes usable now that an
          // admin set its password. A SUSPENDED account STAYS suspended — login
          // remains blocked; reactivation is a separate, deliberate status action.
          ...(existing.status === "PENDING" ? { status: "ACTIVE" as const } : {}),
        },
        include: userWithRolesInclude,
      });
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return updated;
    });
    return toUserPublic(user);
  }

  async function setStatus(id: number, status: "ACTIVE" | "SUSPENDED") {
    if (status === "SUSPENDED") {
      await assertNotRemovingLastAdmin(prisma, id, false);
    }
    const user = await withTransaction(prisma, async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status },
        include: userWithRolesInclude,
      });
      if (status === "SUSPENDED") {
        // Account-level only: block login + revoke sessions. Never cascades.
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
    return toUserPublic(user);
  }

  async function setRoles(id: number, input: z.infer<typeof AssignRolesSchema>) {
    const roleIds = [...new Set(input.roleIds)];
    if (roleIds.length > 0) {
      const found = await prisma.role.count({ where: { id: { in: roleIds } } });
      if (found !== roleIds.length) throw AppError.validation("Role not found");
    }

    const user = await withTransaction(prisma, async (tx) => {
      const adminRole = await tx.role.findUnique({
        where: { key: SYSTEM_ROLES.SYSTEM_ADMIN },
        select: { id: true },
      });
      const willRemainAdmin = adminRole ? roleIds.includes(adminRole.id) : true;
      await assertNotRemovingLastAdmin(tx, id, willRemainAdmin);

      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      });
      return tx.user.findUniqueOrThrow({ where: { id }, include: userWithRolesInclude });
    });
    return toUserPublic(user);
  }

  async function setBranches(id: number, input: z.infer<typeof AssignBranchesSchema>) {
    const user = await withTransaction(prisma, async (tx) => {
      const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw AppError.notFound("User not found");

      const rows = await resolveBranchRows(tx, input.branchIds, input.primaryBranchId);
      await tx.userBranchAssignment.deleteMany({ where: { userId: id } });
      if (rows.length > 0) {
        await tx.userBranchAssignment.createMany({
          data: rows.map((r) => ({ userId: id, ...r })),
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: userWithRolesInclude });
    });
    return toUserPublic(user);
  }

  // Replace a user's DEPARTMENT memberships and re-synchronize the DERIVED branch
  // scope — the single organizational-assignment operation for the normal user form.
  // Both memberships are replaced in one transaction (obsolete branches dropped, new
  // ones added, deduped). An empty departmentIds clears all org assignment; this is a
  // deliberate admin action, and the frontend never sends it for a legacy user that
  // still has no departments (which would otherwise wipe their existing branch scope).
  async function setDepartments(id: number, input: z.infer<typeof AssignDepartmentsSchema>) {
    const user = await withTransaction(prisma, async (tx) => {
      const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw AppError.notFound("User not found");

      // Preserve the current primary branch if it survives the new derivation.
      const currentPrimary = await tx.userBranchAssignment.findFirst({
        where: { userId: id, isPrimary: true },
        select: { branchId: true },
      });
      const { deptRows, branchRows } = await resolveDepartmentsAndBranches(
        tx,
        input.departmentIds,
        currentPrimary?.branchId,
      );

      await tx.userDepartmentAssignment.deleteMany({ where: { userId: id } });
      await tx.userBranchAssignment.deleteMany({ where: { userId: id } });
      if (deptRows.length > 0) {
        await tx.userDepartmentAssignment.createMany({
          data: deptRows.map((r) => ({ userId: id, ...r })),
        });
      }
      if (branchRows.length > 0) {
        await tx.userBranchAssignment.createMany({
          data: branchRows.map((r) => ({ userId: id, ...r })),
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: userWithRolesInclude });
    });
    return toUserPublic(user);
  }

  // Contextual department picker for the user-assignment form: active, branch-scoped
  // departments only (legacy null-branch rows are not assignable). Minimal projection
  // grouped by branch — the frontend renders the branch headers.
  async function departmentOptions(query: z.infer<typeof DepartmentOptionsQuerySchema>) {
    const rows = await prisma.department.findMany({
      where: {
        isActive: true,
        branchId: { not: null },
        ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
      },
      select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
      take: query.limit,
    });
    return rows.map((d) => ({
      departmentId: d.id,
      departmentName: d.name,
      branchId: d.branchId as number,
      branchName: d.branch?.name ?? "",
    }));
  }

  async function remove(id: number) {
    await assertNotRemovingLastAdmin(prisma, id, false);
    try {
      await prisma.user.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw AppError.notFound("User not found");
      }
      throw err;
    }
  }

  return {
    list,
    get,
    create,
    update,
    setPassword,
    setStatus,
    setRoles,
    setBranches,
    setDepartments,
    departmentOptions,
    remove,
  };
}
