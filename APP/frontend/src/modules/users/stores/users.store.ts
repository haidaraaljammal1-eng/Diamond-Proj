"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  createUser as createUserRequest,
  deleteUser as deleteUserRequest,
  listUsers,
  setUserRoles,
  updateUser as updateUserRequest,
  updateUserStatus,
} from "../api/users.api";
import type {
  CreateUserPayload,
  UpdateUserPayload,
  UserDto,
  UserStatus,
} from "../types/user.types";
import type { PageMeta } from "../api/users.api.types";
import { USERS_MAX_PAGE_SIZE } from "../api/users.api.types";

export type UsersLoadStatus = "idle" | "loading" | "ready" | "error";

export interface UsersQuery {
  page: number;
  pageSize: number;
  search: string;
  status?: UserStatus;
}

interface UsersState {
  users: UserDto[];
  meta: PageMeta | null;
  query: UsersQuery;
  status: UsersLoadStatus;
  error: ApiRequestError | null;
  isCreating: boolean;
  createError: ApiRequestError | null;
  isUpdating: boolean;
  updateError: ApiRequestError | null;
  isDeleting: boolean;
  deletingId: number | null;
  deleteError: ApiRequestError | null;
  statusUpdatingIds: Record<number, true>;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<UsersQuery>) => void;
  createUser: (payload: CreateUserPayload) => Promise<boolean>;
  updateUser: (id: number, payload: UpdateUserPayload) => Promise<boolean>;
  deleteUser: (id: number) => Promise<boolean>;
  setUserStatus: (
    id: number,
    status: Exclude<UserStatus, "PENDING">,
  ) => Promise<boolean>;
  clearCreateError: () => void;
  clearUpdateError: () => void;
  clearDeleteError: () => void;
}

let inFlight: Promise<void> | null = null;

export const useUsersStore = create<UsersState>((set, get) => {
  async function fetchUsers(): Promise<void> {
    const { query } = get();
    set({ status: "loading", error: null });
    try {
      const result = await listUsers({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search || undefined,
        status: query.status,
        sort: "createdAt:desc",
      });
      set({
        users: result.data,
        meta: result.meta,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: normalizeApiError(error) });
    }
  }

  function run(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = fetchUsers().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    users: [],
    meta: null,
    query: { page: 1, pageSize: USERS_MAX_PAGE_SIZE, search: "" },
    status: "idle",
    error: null,
    isCreating: false,
    createError: null,
    isUpdating: false,
    updateError: null,
    isDeleting: false,
    deletingId: null,
    deleteError: null,
    statusUpdatingIds: {},
    load() {
      const status = get().status;
      if (status === "ready" || status === "loading") {
        return inFlight ?? Promise.resolve();
      }
      return run();
    },
    refresh() {
      return run();
    },
    setQuery(partial) {
      set((state) => ({
        query: { ...state.query, ...partial },
        status: "idle",
      }));
      void run();
    },
    clearCreateError() {
      set({ createError: null });
    },
    clearUpdateError() {
      set({ updateError: null });
    },
    clearDeleteError() {
      set({ deleteError: null });
    },
    async createUser(payload) {
      set({ isCreating: true, createError: null });
      try {
        await createUserRequest(payload);
        await run();
        set({ isCreating: false });
        return true;
      } catch (error) {
        set({ isCreating: false, createError: normalizeApiError(error) });
        return false;
      }
    },
    async updateUser(id, payload) {
      set({ isUpdating: true, updateError: null });
      try {
        const profile: { email?: string; name?: string | null } = {};
        if (payload.email !== undefined) profile.email = payload.email;
        if (payload.name !== undefined) profile.name = payload.name;

        if (Object.keys(profile).length > 0) {
          await updateUserRequest(id, profile);
        }
        if (payload.roleIds !== undefined) {
          await setUserRoles(id, payload.roleIds);
        }
        await run();
        set({ isUpdating: false });
        return true;
      } catch (error) {
        set({ isUpdating: false, updateError: normalizeApiError(error) });
        return false;
      }
    },
    async deleteUser(id) {
      set({ isDeleting: true, deletingId: id, deleteError: null });
      try {
        await deleteUserRequest(id);
        await run();
        set({ isDeleting: false, deletingId: null });
        return true;
      } catch (error) {
        set({
          isDeleting: false,
          deletingId: null,
          deleteError: normalizeApiError(error),
        });
        return false;
      }
    },
    async setUserStatus(id, status) {
      set((state) => ({
        statusUpdatingIds: { ...state.statusUpdatingIds, [id]: true },
      }));
      try {
        const updated = await updateUserStatus(id, status);
        set((state) => ({
          users: state.users.map((user) => (user.id === id ? updated : user)),
        }));
        return true;
      } catch {
        await run();
        return false;
      } finally {
        set((state) => {
          const rest = { ...state.statusUpdatingIds };
          delete rest[id];
          return { statusUpdatingIds: rest };
        });
      }
    },
  };
});
