import { Prisma } from "@prisma/client";
import type { UserPublic } from "src/modules/users/users.schema";

/** Standard include to load a user with roles + their permissions + branch scope. */
export const userWithRolesInclude = {
  roles: {
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  },
  // Department membership is the ORGANIZATIONAL assignment source; a user's branch
  // scope is derived from these departments' branches. Exposed so the edit form can
  // hydrate the grouped department picker and show the derived branch summary.
  departmentAssignments: {
    include: {
      department: {
        select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
      },
    },
    orderBy: [{ departmentId: "asc" }],
  },
  // Branch membership drives hard, backend-enforced branch scoping (see
  // UserBranchAssignment). DERIVED from department assignments; exposed so the UI can
  // show a user's real branch scope. Primary branch first.
  branchAssignments: {
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ isPrimary: "desc" }, { branchId: "asc" }],
  },
} satisfies Prisma.UserInclude;

export type UserWithRoles = Prisma.UserGetPayload<{
  include: typeof userWithRolesInclude;
}>;

/** Map a DB user to the public API shape. passwordHash is structurally absent. */
export function toUserPublic(user: UserWithRoles): UserPublic {
  const permissions = [
    ...new Set(
      user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
    ),
  ];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      key: ur.role.key,
      name: ur.role.name,
    })),
    permissions,
    departments: user.departmentAssignments.map((da) => ({
      id: da.department.id,
      name: da.department.name,
      branchId: da.department.branchId,
      branchName: da.department.branch?.name ?? null,
      isManager: da.isManager,
    })),
    branches: user.branchAssignments.map((ba) => ({
      id: ba.branch.id,
      name: ba.branch.name,
      isPrimary: ba.isPrimary,
    })),
    twoFactorEnabled: user.twoFactorEnabled,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
