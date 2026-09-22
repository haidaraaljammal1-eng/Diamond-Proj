"use client";

import { useSession } from "next-auth/react";
import { SYSTEM_ADMIN_ROLE } from "@/modules/navigation/navigation.types";

export function usePermissions() {
  const { data: session } = useSession();
  const permissions = session?.user.permissions ?? [];
  const roles = session?.user.roles ?? [];
  const isSystemAdmin = roles.includes(SYSTEM_ADMIN_ROLE);

  return {
    permissions,
    isSystemAdmin,
    hasPermission: (permission: string) =>
      isSystemAdmin || permissions.includes(permission),
  };
}
