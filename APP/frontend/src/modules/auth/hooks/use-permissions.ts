"use client";

import { useAuthStore } from "../stores/auth.store";

export function usePermissions() {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);

  return {
    permissions,
    hasPermission: (permission: string) => permissions.includes(permission),
  };
}
