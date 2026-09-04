"use client";

import { useSession } from "next-auth/react";

export function usePermissions() {
  const { data: session } = useSession();
  const permissions = session?.user.permissions ?? [];

  return {
    permissions,
    hasPermission: (permission: string) => permissions.includes(permission),
  };
}
