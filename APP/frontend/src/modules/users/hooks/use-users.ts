"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useUsersStore } from "../stores/users.store";
import type { PageMeta } from "../api/users.api.types";
import type { UserDto, UserStatus } from "../types/user.types";
import { USERS_PAGE_PERMISSIONS } from "../users.permissions";

export interface UseUsersResult {
  users: UserDto[];
  meta: PageMeta | null;
  search: string;
  statusFilter?: UserStatus;
  isAllowed: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  loadUsers: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  setSearch: (search: string) => void;
  setStatusFilter: (status?: UserStatus) => void;
  setPage: (page: number) => void;
}

export function useUsers(): UseUsersResult {
  const { hasPermission } = usePermissions();
  const users = useUsersStore((state) => state.users);
  const meta = useUsersStore((state) => state.meta);
  const query = useUsersStore((state) => state.query);
  const status = useUsersStore((state) => state.status);
  const error = useUsersStore((state) => state.error);
  const load = useUsersStore((state) => state.load);
  const refresh = useUsersStore((state) => state.refresh);
  const setQuery = useUsersStore((state) => state.setQuery);

  const isAllowed = USERS_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  return useMemo(
    () => ({
      users,
      meta,
      search: query.search,
      statusFilter: query.status,
      isAllowed,
      isLoading: status === "loading" || (isAllowed && status === "idle"),
      isReady: status === "ready",
      error: status === "error" ? error : null,
      loadUsers: load,
      refreshUsers: refresh,
      setSearch: (search: string) => {
        void setQuery({ search, page: 1 });
      },
      setStatusFilter: (statusFilter?: UserStatus) => {
        void setQuery({ status: statusFilter, page: 1 });
      },
      setPage: (page: number) => {
        void setQuery({ page });
      },
    }),
    [
      users,
      meta,
      query.search,
      query.status,
      isAllowed,
      status,
      error,
      load,
      refresh,
      setQuery,
    ],
  );
}
