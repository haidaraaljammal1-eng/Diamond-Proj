import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { paginate, parseSort } from "src/lib/http/pagination";
import type { RolePublic } from "src/modules/roles/roles.schema";
import type { z } from "zod";
import type {
  CreateRoleSchema,
  ListRolesQuerySchema,
  SetFunctionalGrantsSchema,
  SetRolePermissionsSchema,
  UpdateRoleSchema,
} from "src/modules/roles/roles.schema";
import type { AuthUser } from "src/lib/context/auth-context";
import { isFunctionalCapabilityKey } from "src/lib/rbac/functional-permissions/keys";
import { normalizeFunctionalGrants } from "src/lib/rbac/functional-permissions/policy-engine";
import {
  assertActorMayDelegatePermissionKeys,
  assertActorMayDeleteRole,
  assertActorMayMutateSystemRole,
  assertKnownPermissionKeys,
  assertNoFunctionalKeysInLegacyPermissionPayload,
} from "src/lib/rbac/functional-permissions/delegation-guard";
import { isFunctionalRbacV2Enabled } from "src/lib/rbac/functional-permissions/enforcement";

const roleInclude = {
  permissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;
type RoleWithPermissions = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

// Scalar columns a client may sort roles by (whitelist — a raw field is never
// passed to Prisma; unknown falls back to the default).
const ROLE_SORTABLE = ["name", "createdAt"] as const;

function toRolePublic(role: RoleWithPermissions): RolePublic {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((rp) => rp.permission.key),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function preservedFunctionalKeys(role: RoleWithPermissions): string[] {
  return role.permissions
    .map((rp) => rp.permission.key)
    .filter((key) => isFunctionalCapabilityKey(key));
}

export function createRolesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function resolvePermissionIds(keys: string[]): Promise<number[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    assertKnownPermissionKeys(unique);
    const perms = await prisma.permission.findMany({
      where: { key: { in: unique } },
      select: { id: true },
    });
    if (perms.length !== unique.length) throw AppError.validation("Permission not found");
    return perms.map((p) => p.id);
  }

  async function loadOrThrow(id: number): Promise<RoleWithPermissions> {
    const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw AppError.notFound("Role not found");
    return role;
  }

  async function list(query: z.infer<typeof ListRolesQuerySchema>) {
    const where: Prisma.RoleWhereInput = query.search
      ? {
          OR: [
            { key: { contains: query.search, mode: "insensitive" } },
            { name: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {};
    const { field, direction } = parseSort(query.sort, ROLE_SORTABLE, {
      field: "name",
      direction: "asc",
    });
    const result = await paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.role.count({ where }),
      findMany: (skip, take) =>
        prisma.role.findMany({
          where,
          include: roleInclude,
          orderBy: { [field]: direction } as Prisma.RoleOrderByWithRelationInput,
          skip,
          take,
        }),
    });
    return { data: result.data.map(toRolePublic), meta: result.meta };
  }

  async function get(id: number) {
    return toRolePublic(await loadOrThrow(id));
  }

  async function create(
    input: z.infer<typeof CreateRoleSchema>,
    actor: AuthUser,
  ) {
    assertActorMayDelegatePermissionKeys(actor, input.permissionKeys);
    if (isFunctionalRbacV2Enabled()) {
      assertNoFunctionalKeysInLegacyPermissionPayload(input.permissionKeys);
    }
    const permissionIds = await resolvePermissionIds(input.permissionKeys);
    try {
      const role = await prisma.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          isSystem: false,
          permissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        include: roleInclude,
      });
      return toRolePublic(role);
    } catch (err) {
      if (isUniqueViolation(err))
        throw AppError.conflict("A conflicting resource already exists");
      throw err;
    }
  }

  async function update(
    id: number,
    input: z.infer<typeof UpdateRoleSchema>,
    actor: AuthUser,
  ) {
    const role = await loadOrThrow(id);
    assertActorMayMutateSystemRole(actor, role);
    if (role.isSystem) {
      throw new AppError({
        code: ErrorCode.CONFLICT,
        message: "System roles cannot be modified",
      });
    }
    const data: Prisma.RoleUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    const updated = await prisma.role.update({ where: { id }, data, include: roleInclude });
    return toRolePublic(updated);
  }

  async function setPermissions(
    id: number,
    input: z.infer<typeof SetRolePermissionsSchema>,
    actor: AuthUser,
  ) {
    const role = await loadOrThrow(id);
    assertActorMayMutateSystemRole(actor, role);
    if (role.isSystem) {
      throw new AppError({
        code: ErrorCode.CONFLICT,
        message: "System roles cannot be modified",
      });
    }

    assertNoFunctionalKeysInLegacyPermissionPayload(input.permissionKeys);
    assertActorMayDelegatePermissionKeys(actor, input.permissionKeys);

    const updated = await withTransaction(prisma, async (tx) => {
      const fresh = await tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
      const mergedKeys = isFunctionalRbacV2Enabled()
        ? [
            ...new Set([
              ...preservedFunctionalKeys(fresh),
              ...input.permissionKeys,
            ]),
          ]
        : [...new Set(input.permissionKeys)];

      assertActorMayDelegatePermissionKeys(actor, mergedKeys);
      const permissionIds = await resolvePermissionIds(mergedKeys);

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
      return tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
    });
    return toRolePublic(updated);
  }

  async function remove(id: number, actor: AuthUser) {
    assertActorMayDeleteRole(actor);
    const role = await loadOrThrow(id);
    assertActorMayMutateSystemRole(actor, role);
    if (role.isSystem) throw AppError.conflict("System roles cannot be deleted");
    await prisma.role.delete({ where: { id } });
  }

  /**
   * Replace only `diamond.fn.*` grants on a role. Legacy/hidden technical keys are
   * preserved — intended for Phase 3 matrix; does not auto-expand to broad legacy keys.
   */
  async function setFunctionalGrants(
    id: number,
    input: z.infer<typeof SetFunctionalGrantsSchema>,
    actor: AuthUser,
  ) {
    const role = await loadOrThrow(id);
    assertActorMayMutateSystemRole(actor, role);
    if (role.isSystem) {
      throw new AppError({
        code: ErrorCode.CONFLICT,
        message: "System roles cannot be modified",
      });
    }
    const normalized = normalizeFunctionalGrants(input.functionalGrants);
    if (!normalized.ok) {
      throw AppError.validation(
        normalized.issues.map((i) => i.message).join("; ") || "Invalid functional grants",
      );
    }
    assertActorMayDelegatePermissionKeys(actor, normalized.normalized);

    if (input.ifMatchUpdatedAt) {
      const expectedMs = Date.parse(input.ifMatchUpdatedAt);
      const actualMs = role.updatedAt.getTime();
      if (Number.isNaN(expectedMs) || expectedMs !== actualMs) {
        throw AppError.modified({
          roleId: id,
          expectedUpdatedAt: input.ifMatchUpdatedAt,
          actualUpdatedAt: role.updatedAt.toISOString(),
        });
      }
    }

    const updated = await withTransaction(prisma, async (tx) => {
      const fresh = await tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
      if (input.ifMatchUpdatedAt) {
        const expectedMs = Date.parse(input.ifMatchUpdatedAt);
        if (fresh.updatedAt.getTime() !== expectedMs) {
          throw AppError.modified({
            roleId: id,
            expectedUpdatedAt: input.ifMatchUpdatedAt,
            actualUpdatedAt: fresh.updatedAt.toISOString(),
          });
        }
      }
      const preserved = fresh.permissions
        .map((rp) => rp.permission.key)
        .filter((key) => !isFunctionalCapabilityKey(key));
      const merged = [...new Set([...preserved, ...normalized.normalized])];
      assertActorMayDelegatePermissionKeys(actor, merged);
      const permissionIds = await resolvePermissionIds(merged);

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
      await tx.role.update({
        where: { id },
        data: { name: fresh.name },
      });
      return tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
    });
    return toRolePublic(updated);
  }

  return { list, get, create, update, setPermissions, setFunctionalGrants, remove };
}
